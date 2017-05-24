# GithubStorageWebhookFunctionSite
## Serve a website out of an Azure Function using Azure Storage Block Blobs and keep the Azure Storage container in sync with a Github repo

1. fork me from <https://github.com/peteroden/GithubStorageWebhookFunctionSite>
2. add any APIs your site will need to use server-side code for
3. use this [ARM template](https://github.com/peteroden/FunctionWebsiteArmTemplate) to deploy a Function and deploy the repo
4. update the below environment varaiables to point to your static website content, then set this template as the continueous deployment source for the Azure Function.
5. on the github static content repo, create a new webhook and enter the function webhook URL and key as the target for _pulls only_

### Environment variables that need to be set:
* AZURE_STORAGE_ACCOUNT
* AZURE_STORAGE_ACCESS_KEY
* STATIC_CONTENT_CONTAINER
* STATIC_CONTENT_REPO
* FUNCTION_GITHUB_USER
* FUNCTION_GITHUB_REPO

### Static content requirements:
* You must have an index.html that will serve as the root page
* You must put all other files inside the lib directory