const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { Kafka } = require('kafkajs');
const { createRxDatabase, addRxPlugin } = require('rxdb');
const { getRxStorageMemory } = require('rxdb/plugins/storage-memory');
const path = require('path');

let notificationsCollection = null;

const notificationSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:         { type: 'string', maxLength: 100 },
    message:    { type: 'string' },
    type:       { type: 'string' },
    created_at: { type: 'string' }
  },
  required: ['id', 'message', 'type', 'created_at']
};

async function initDB() {
  const db = await createRxDatabase({
    name: 'notificationsdb',
    storage: getRxStorageMemory()
  });
  await db.addCollections({ notifications: { schema: notificationSchema } });
  notificationsCollection = db.notifications;
  console.log('RxDB initialisé');
}

const kafka = new Kafka({ brokers: ['localhost:9092'] });
const consumer = kafka.consumer({ groupId: 'notifications-group' });

async function startKafka() {
  await consumer.connect();
  await consumer.subscribe({ topic: 'order-created', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const order = JSON.parse(message.value.toString());
      const notification = {
        id: `notif-${Date.now()}`,
        message: `Nouvelle commande #${order.id} de ${order.customer_name} pour ${order.quantity} article(s)`,
        type: 'order',
        created_at: new Date().toISOString()
      };
      await notificationsCollection.insert(notification);
      console.log('Notification enregistrée:', notification.message);
    }
  });

  console.log('Kafka Notifications connecté');
}

const packageDef = protoLoader.loadSync(
  path.join(__dirname, '../proto/notifications.proto'),
  { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true }
);
const proto = grpc.loadPackageDefinition(packageDef).notifications;

async function getNotifications(call, callback) {
  const docs = await notificationsCollection.find().exec();
  const notifications = docs.map(d => d.toJSON());
  callback(null, { notifications });
}

async function main() {
  await initDB();
  await startKafka();

  const server = new grpc.Server();
  server.addService(proto.NotificationService.service, { getNotifications });

  server.bindAsync('0.0.0.0:50053', grpc.ServerCredentials.createInsecure(), () => {
    console.log('Microservice Notifications démarré sur le port 50053');
  });
}

main().catch(console.error);