var request = require('request');
var azure = require('azure-storage');
var unzip = require('unzip');
var eachLimit = require('async').eachLimit;
var parallel = require('async').parallel;

var blobContainer = process.env.STATIC_CONTENT_CONTAINER;
var githubrepo = process.env.STATIC_CONTENT_USER + '/' + process.env.STATIC_CONTENT_REPO;
var asyncThreadLimit = 10;

module.exports = function (context, data) {
  context.log('GitHub Storage WebHook triggered!');
  context.res = {
    body: 'New GitHub commit'
  };

  var retryOperations = new azure.LinearRetryPolicyFilter();
  var blobService = azure.createBlobService().withFilter(retryOperations);

  blobService.createContainerIfNotExists(blobContainer, function (error, result, response) {
    if (!error) {
      if (result.created) {
        //the container didn't exists, so let's download the entire repo
        context.log("container didn't exist so created it and now downloading the entire repo");
        request
          .get('https://api.github.com/repos/' + githubrepo + '/zipball')
          .on('error', function (err) {
            context.log(err);
            context.done();
          })
          .pipe(unzip.Parse())
          .on('entry',  function  (entry)  {
            var  fileName  =  entry.path;
            if  (entry.type ===  'File')  {
              entry.pipe(blobService.createWriteStreamToBlockBlob(blobContainer, fileName));
            } 
            else  {
              entry.autodrain();
            }
          });
        context.done();
      } else {
        // container already existed so this is github triggered update
        eachLimit(data.commits, asyncThreadLimit, function (commit, commitCallback) {
          parallel([
              function (addedCallback) {
                eachLimit(commit.added, asyncThreadLimit, function (fileName, callback) {
                  context.log('add file https://github.com/' + githubrepo + '/raw/master/' + fileName, 'to azure storage account');
                  writeblobfile(fileName, blobService, context, callback);
                }, function () {
                  addedCallback();
                });
              },
              function (removedCallback) {
                eachLimit(commit.added, asyncThreadLimit, function (fileName, callback) {
                  context.log('remove file ', fileName, 'from azure storage account');
                  removeblobfile(fileName, blobService, context, callback);
                }, function () {
                  removedCallback();
                });
              },
              function (modifiedCallback) {
                eachLimit(commit.added, asyncThreadLimit, function (fileName, callback) {
                  context.log('modify file https://github.com/' + githubrepo + '/raw/master/' + fileName, 'in azure storage account');
                  writeblobfile(fileName, blobService, context, callback);
                }, function () {
                  modifiedCallback();
                });
              },
            ],
            function (err, results) {
              commitCallback();
            });
        }, function () {
          context.done();
        });
      }

    } else {
      context.log(error);
      context.done();
    }
  });
};

function writeblobfile(fileName, blobService, context, callback) {
  request
    .get('https://github.com/' + githubrepo + '/raw/master/' + fileName)
    .on('error', function (err) {
      context.log(err);
    })
    .pipe(blobService.createWriteStreamToBlockBlob(blobContainer, fileName, function() { callback(); }));
}

function removeblobfile(fileName, blobService, context, callback) {
  blobService.deleteBlob(blobContainer, fileName, function (error, response) {
    if (!error) {
      // Blob has been deleted
    }
    callback();
  });
}