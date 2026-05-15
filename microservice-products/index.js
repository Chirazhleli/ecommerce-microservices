const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const Database = require('better-sqlite3');
const { Kafka } = require('kafkajs');
const path = require('path');

// Connexion base de données SQLite3
const db = new Database('products.db');

// Créer la table si elle n'existe pas
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    stock INTEGER NOT NULL
  )
`);

// Connexion Kafka
const kafka = new Kafka({ brokers: ['localhost:9092'] });
const producer = kafka.producer();

async function startKafka() {
  await producer.connect();
  console.log('Kafka producer connecté');
}

// Charger le fichier proto
const packageDef = protoLoader.loadSync(
  path.join(__dirname, '../proto/products.proto'),
  { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true }
);
const proto = grpc.loadPackageDefinition(packageDef).products;

// Implémenter les fonctions gRPC
function createProduct(call, callback) {
  const { name, description, price, stock } = call.request;
  const stmt = db.prepare(
    'INSERT INTO products (name, description, price, stock) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(name, description, price, stock);
  const product = { id: result.lastInsertRowid, name, description, price, stock };

  // Publier un événement Kafka
  producer.send({
    topic: 'product-created',
    messages: [{ value: JSON.stringify(product) }]
  });

  console.log('Produit créé:', product);
  callback(null, product);
}

function getProduct(call, callback) {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(call.request.id);
  if (!product) {
    return callback({ code: grpc.status.NOT_FOUND, message: 'Produit non trouvé' });
  }
  callback(null, product);
}

function listProducts(call, callback) {
  const products = db.prepare('SELECT * FROM products').all();
  callback(null, { products });
}

// Démarrer le serveur gRPC
async function main() {
  await startKafka();

  const server = new grpc.Server();
  server.addService(proto.ProductService.service, {
    createProduct,
    getProduct,
    listProducts
  });

  server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
    console.log('Microservice Products démarré sur le port 50051');
  });
}

main().catch(console.error);