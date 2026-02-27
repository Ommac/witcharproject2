const { MongoMemoryServer } = require('mongodb-memory-server');
(async () => {
  const mongod = await MongoMemoryServer.create({
    instance: { port: 27017, dbName: 'fraud_detection' },
    binary: { version: '7.0.14' }
  });
  const uri = mongod.getUri('fraud_detection');
  console.log('MONGO_URI=' + uri);
  setInterval(() => {}, 1 << 30);
})();
