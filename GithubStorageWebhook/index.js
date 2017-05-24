var request = require('request');
var azure = require('azure-storage');
var unzip = require('unzip');

var blobContainer = 'static-website';
var githubrepo = 'peteroden/peterodenwebsite';

module.exports = function (context, data) {
    context.log('GitHub Storage WebHook triggered!'); //var data = ', data);
    context.res = { body: 'New GitHub commits: ' + data.commits};

    var retryOperations = new azure.LinearRetryPolicyFilter();
    var blobService = azure.createBlobService().withFilter(retryOperations);

    blobService.createContainerIfNotExists(blobContainer, function(error, result, response){
        if(!error){
            if (result.created) {
                //the container didn't exists, so let's download the entire repo
                context.log("container didn't exist so created it and now downloading the entire repo");
                request
                    .get('https://api.github.com/repos/'+githubrepo+'/zipball')
                    .on('error', function(err) {
                        context.log(err);
                        context.done();
                    })
                    .pipe(unzip.Parse())
                    .on('entry', function (entry) {
                        var fileName = entry.path;
                        if (entry.type === 'File') {
                            entry.pipe(blobService.createWriteStreamToBlockBlob(blobContainer, fileName));
                        } else {
                            entry.autodrain();
                        }
                    });
                context.done();
            } else {
                // container already existed so this is github triggered update
                data.commits.forEach( function(commit) {
                    commit.added.forEach(function(fileName) {
                        context.log('add file https://github.com/'+githubrepo+'/raw/master/'+fileName, 'to azure storage account');
                        writeblobfile(fileName, blobService, context);
                    });
                    commit.removed.forEach(function(fileName) {
                        context.log('remove file ', fileName, 'from azure storage account');
                        deleteblobfile(fileName, blobService, context);
                    });
                    commit.modified.forEach(function(fileName) {
                        context.log('modify file https://github.com/'+githubrepo+'/raw/master/'+fileName, 'in azure storage account');
                        writeblobfile(fileName, blobService, context);
                    });
                });
                context.done();
            }
            
        } else {
            context.log(error);
            context.done();
        }
    });
};

function writeblobfile(fileName, blobService, context) {
    request
        .get('https://github.com/'+githubrepo+'/raw/master/'+fileName)
        .on('error', function(err) {
            context.log(err);
        })
        .pipe(blobService.createWriteStreamToBlockBlob(blobContainer, fileName));
}

function deleteblobfile(fileName, blobService, context) {
    blobService.deleteBlob(blobContainer, fileName, function(error, response){
        if(!error){
            // Blob has been deleted
        }
    });
}