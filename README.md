SimpleS3 is a very simple S3 http client. It wraps [hyperquest](https://github.com/substack/hyperquest) for HTTP requests, and [faketoe](https://github.com/spumko/faketoe) for xml parsing.

Usage
=====

Installation
------------

```
npm install simples3
```

Setup
-------

Simply pass a config in with a key, secret, and optional host (host defaults to Amazon's S3 service)

```javascript
var config = {
  key: 'AWSKEY',
  secret: 'AWSSECRET',
  host: 'https://s3.amazonaws.com'
},
  simpleS3 = require('simples3'),
  s3Store = simpleS3.createClient(config);
```


List buckets
------------

```javascript
s3Store.getBuckets(function _bucketList(err, buckets) {
  console.log(buckets);
});
```

Bucket info
-----------

```javascript
s3Store.getBucket('myBucket', function _bucketInfo(err, bucketInfo) {
  console.log(bucketInfo)
  //To get just the files in the bucket
  console.log(bucketInfo.Contents);
});
```

Create bucket
-------------

```javascript
s3Store.createBucket('newBucket', function _newBucket(err, newBucket) {
  //Returns the created bucket info
  console.log(newBucket);
});
```

Delete bucket
-------------

```javascript
s3Store.deleteBucket('badBucket', function _deletedBucket(err, deletedBucket) {
  //Returns info for the deleted bucket
  console.log(deletedBucket);
});
```

Get object
----------

```javascript
// Note that this returns a response object from S3 as well as the object
s3Store.getObject('myBucket', 'objectId', function _responseObject(err, response, myObject) {
  console.log(response.headers);
  console.log(myObject);
});

// This function also returns a stream that can be piped directly to a writable stream
s3Store.getObject('myBucket', 'objectId').pipe(fs.createWriteStream('./temp.out'));
```

Get signed url to object
------------------------

```javascript
var expires = new Date();
expires.setHours(expires.getHours() + 1); // JavaScript date object: one hour from now
s3store.getObjectUrl('myBucket', 'objectId', expires, function _objectUrl(err, url) {
  console.log(url);
});
```

Create object
-------------

```javascript
// You can either send data directly
var fileinfo = {
  data: fs.readFileSync('./images/funny/cat_macro.png'),
  type: 'image/png'
};

s3Store.createObject('myBucket', 'cat_macro.png', fileInfo, function _newObject(err, object) {
  //Returns info for the uploaded object
  console.log(object);
});

// Or you can provide some metadata and stream the data
var fileinfo = {
  type: 'image/png',
  size: 65432 // you're on your own to determine this before starting the stream
};

fs.createReadStream('./images/funny/cat_macro.png').pipe(s3Store.createObject('myBucket', 'cat_macro.png', fileInfo, function _newObject(err, object) {
  //Returns info for the uploaded object
  console.log(object); //Object id will be 'cat_macro.png'
}));

```

Update object
-------------
Works just like creating an object, just use updateObject instead.
There isn't much of a distinction between the two in S3

Delete object
-------------

```javascript
s3Store.deleteObject('myBucket', 'cat_macro.png', function _deletedObject(err, deletedObject) {
  //Returns info on the deleted object
  console.log(deletedObject);
});
```

Parse a url
-----------

```javascript
s3Store.parseUrl('http://s3.amazonaws.com/yourbucket/your/resource/name.jpg', function (err, result) {
  // Returns an object with 'bucket' and 'resource' properties
});

// Also works synchronously
var parts = s3Store.parseUrl('http://s3.amazonaws.com/yourbucket/your/resource/name.jpg');
```
