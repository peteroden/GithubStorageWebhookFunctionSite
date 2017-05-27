var request = require('request');
var azure = require('azure-storage');
var eachLimit = require('async').eachLimit;
var parallel = require('async').parallel;
var mime = require('mime-types');

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

        request(options, function (error, repoListResponse, body) {
          context.log('error:', error); // Print the error if one occurred
          var data = JSON.parse(body);

          eachLimit(data.tree, asyncThreadLimit, function (item, callback) {
            if (item.type == 'blob') {
              context.log('add file https://github.com/' + githubrepo + '/raw/master/' + item.path, 'to azure storage account');
              writeblobfile(item.path, blobService, context, callback);
            } else {
              callback();
            }
          }, function () {
            context.done();
          });
        });
      } else {
        // container already existed so this is a github commit triggered update
        eachLimit(data.commits, asyncThreadLimit, function (commit, commitCallback) {
          const options = {
            url: 'https://api.github.com/repos/'+githubrepo+'/commits/'+commit.id,
            headers: {'User-Agent': 'GitHubStorageWebhookFunctionSite'}
          };

          request(options, function (error, repoListResponse, body) {
            context.log(error); // Print the error if one occurred
            var commits = JSON.parse(body);
            //context.log(data);
            eachLimit(commits.files, asyncThreadLimit, function (item, callback) {
              if (item.status == 'modified' || item.status == 'added') {
                context.log('write file ', item.filename,'from', item.raw_url, 'to azure storage account');
                writeblobfile(item.filename, item.raw_url, blobService, context, callback);
              } else if (item.status == 'removed') {
                context.log('remove file ', item.filename, 'from azure storage account');
                removeblobfile(item.filename, blobService, context, callback);
              } else {
                callback();
              }
            }, function () {
              commitCallback();
            });
          });
        }, function () {
          context.done();
        });
      }
    } else {
      context.log('Error creating storage container '+error);
      context.done();
    }
  });
};

function writeblobfile(fileName, url, blobService, context, callback) {
  request
    .get({ url: url, headers: {'User-Agent': 'GitHubStorageWebhookFunctionSite'} })
    .on('error', function (err) {
      context.log(err);
    })
    .pipe(blobService.createWriteStreamToBlockBlob(blobContainer, fileName, { contentSettings: { contentType: mime.lookup(fileName) } }, function() { callback(); }));
}

function removeblobfile(fileName, blobService, context, callback) {
  blobService.deleteBlob(blobContainer, fileName, function (error, response) {
    if (!error) {
      // Blob has been deleted
    }
    callback();
  });
}