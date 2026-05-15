const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const Database = require('better-sqlite3');
const { Kafka } = require('kafkajs');
const path = require('path');

const db = new Database('orders.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending'
  )
`);

const kafka = new Kafka({ brokers: ['localhost:9092'] });
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'orders-group' });

async function startKafka() {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: 'product-created', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const product = JSON.parse(message.value.toString());
      console.log('Produit reçu via Kafka:', product);
    }
  });

  console.log('Kafka Orders connecté');
}

const packageDef = protoLoader.loadSync(
  path.join(__dirname, '../proto/orders.proto'),
  { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true }
);
const proto = grpc.loadPackageDefinition(packageDef).orders;

function createOrder(call, callback) {
  const { product_id, quantity, customer_name } = call.request;
  const stmt = db.prepare(
    'INSERT INTO orders (product_id, quantity, customer_name, status) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(product_id, quantity, customer_name, 'pending');
  const order = { id: result.lastInsertRowid, product_id, quantity, customer_name, status: 'pending' };

  producer.send({
    topic: 'order-created',
    messages: [{ value: JSON.stringify(order) }]
  });

  console.log('Commande créée:', order);
  callback(null, order);
}

function getOrder(call, callback) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(call.request.id);
  if (!order) {
    return callback({ code: grpc.status.NOT_FOUND, message: 'Commande non trouvée' });
  }
  callback(null, order);
}

function listOrders(call, callback) {
  const orders = db.prepare('SELECT * FROM orders').all();
  callback(null, { orders });
}

async function main() {
  await startKafka();

  const server = new grpc.Server();
  server.addService(proto.OrderService.service, {
    createOrder,
    getOrder,
    listOrders
  });

  server.bindAsync('0.0.0.0:50052', grpc.ServerCredentials.createInsecure(), () => {
    console.log('Microservice Orders démarré sur le port 50052');
  });
}

main().catch(console.error);