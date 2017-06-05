var request = require('request');
var azure = require('azure-storage');
var eachLimit = require('async').eachLimit;
var parallel = require('async').parallel;

var blobContainer = process.env.STATIC_CONTENT_CONTAINER;
var githubrepo = process.env.STATIC_CONTENT_OWNER + '/' + process.env.STATIC_CONTENT_REPO;
var asyncThreadLimit = 20;

module.exports = function (context, data) {
  context.log('GitHub Storage WebHook triggered!');
  context.res = { body: 'New GitHub commit' };

  var retryOperations = new azure.LinearRetryPolicyFilter();
  var blobService = azure.createBlobService().withFilter(retryOperations);

  blobService.createContainerIfNotExists(blobContainer, {publicAccessLevel : 'blob'}, function (error, result, response) {
    if (!error) {
      if (result.created) {
        //the container didn't exists, so let's download the entire repo
        context.log("container didn't exist so created it and now downloading the entire repo");
        var options = {
          url: 'https://api.github.com/repos/'+githubrepo+'/git/trees/master?recursive=1',
          headers: {'User-Agent': 'GitHubStorageWebhookFunctionSite'}
        };

        request(options, (error, repoListResponse, body) => {
          context.log('error:', error); // Print the error if one occurred
          var data = JSON.parse(body);

          var actionList = data.tree
            .filter( (item) => {return item.type == 'blob'})
            .map( (item) => {return `{"action":"added", "path":${item.path},"source":${item.url}` });
          context.bindings.actionQueue = actionList;
          context.done();
        });
      } else {
        // container already existed so this is a github commit triggered update
        data.commits.forEach( (commit) => {
          var options = {
            url: 'https://api.github.com/repos/'+githubrepo+'/commits/'+commit.id,
            headers: {'User-Agent': 'GitHubStorageWebhookFunctionSite'}
          };
          request(options, (error, repoListResponse, body) => {
            context.log(error); // Print the error if one occurred
            var data = JSON.parse(body);
            var actionList = data.tree
              .filter( (item) => {return item.type == 'blob'})
              .map( (item) => {return `{"action":${item.status}, "path":${item.filename}, ${item.status != "removed"? "source":item.raw_url}}` });
            context.bindings.actionQueue = actionList;
            context.done();
          })
        });
      }
    } else {
      context.log('Error creating storage container '+error);
      context.done();
    }
  });
};