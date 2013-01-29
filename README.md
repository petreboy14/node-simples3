SimpleS3 is a very simple S3 http client. It wraps [request](https://github.com/mikeal/request) and lets that module do all the heavy lifting

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
  s3Store = simpleS3(config);
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
//Note that this returns a response object from S3 as well as the object
s3Store.getObject('myBucket', 'objectId', function _responseObject(err, response, myObject) {
  console.log(response.headers);
  console.log(myObject);
});
```

Get signed url to object
------------------------

```javascript
var expires = parseInt(Date.now()/1000, 10) + 3600; //Unix timestamp: one hour from now
s3store.getObjectUrl('myBucket', 'objectId', expires, function _objectUrl(err, url) {
  console.log(url);
});
```

Get raw object
--------------

```javascript
// This method pipes the object straight to the given response object,
// which is helpful if your code doesn't need to inspect the object
s3Store.getRawObject('myBucket', 'objectId', response);
```

Create object
-------------

```javascript
// This is intended to be easily passed a file upload object from express
var fileInfo = {path: './images/funny/cat_macro.png', 'type': 'image/png'}
s3Store.createObject('myBucket', 'cat_macro.png', fileInfo, function _newObject(err, object) {
  //Returns info for the uploaded object
  console.log(object);
});

// You can also omit the objectId and let the file path define what it will be
var fileInfo = {path: './images/funny/cat_macro.png', 'type': 'image/png'}
s3Store.createObject('myBucket', null, fileInfo, function _newObject(err, object) {
  //Returns info for the uploaded object
  console.log(object); //Object id will be 'cat_macro.png'
});

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
