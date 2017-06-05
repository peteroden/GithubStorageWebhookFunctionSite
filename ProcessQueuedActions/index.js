var azure = require('azure-storage').createBlobService();
var mime = require('mime-types');
var request = require('request');

var blobService = azure.createBlobService().withFilter(new azure.createBlobService());
var blobContainer = process.env.STATIC_CONTENT_CONTAINER;

module.exports = function (context, actionQueueItem) {
    context.log('JavaScript queue trigger function received', actionQueueItem);
    var item = JSON.parse(actionQueueItem);
    item.action == 'removed' ? removeBlob(item.path, context.done()) : writeBlob(item.path, item.source, context.done());
};

function removeBlob (path, callback) {
  blobService.deleteBlob(blobContainer, path, function (error, response) {
    context.log("removed ", path);
    callback();
  });
}

function writeBlob (path, source, callback) {
  request.get({ url: source, headers: {'User-Agent': 'GitHubStorageWebhookFunctionSite'} })
    .on('error', function (err) {
      context.log(err);
    })
    .pipe(blobService.createWriteStreamToBlockBlob(blobContainer, path, { contentSettings: { contentType: mime.lookup(path) } }, function() { context.log("wrote ",path," from ",source); callback(); }));
}