const express = require('express');
const cors = require('cors');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ICI - avant tout le reste
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../client/index.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../client/admin.html'));
});
const productsDef = protoLoader.loadSync(path.join(__dirname, '../proto/products.proto'),
  { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
const ordersDef = protoLoader.loadSync(path.join(__dirname, '../proto/orders.proto'),
  { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
const notifsDef = protoLoader.loadSync(path.join(__dirname, '../proto/notifications.proto'),
  { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });

const productsProto = grpc.loadPackageDefinition(productsDef).products;
const ordersProto = grpc.loadPackageDefinition(ordersDef).orders;
const notifsProto = grpc.loadPackageDefinition(notifsDef).notifications;

const productsClient = new productsProto.ProductService('localhost:50051', grpc.credentials.createInsecure());
const ordersClient = new ordersProto.OrderService('localhost:50052', grpc.credentials.createInsecure());
const notifsClient = new notifsProto.NotificationService('localhost:50053', grpc.credentials.createInsecure());

function grpcCall(client, method, request) {
  return new Promise((resolve, reject) => {
    client[method](request, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

app.post('/products', async (req, res) => {
  try { res.json(await grpcCall(productsClient, 'createProduct', req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/products', async (req, res) => {
  try { res.json((await grpcCall(productsClient, 'listProducts', {})).products); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/products/:id', async (req, res) => {
  try { res.json(await grpcCall(productsClient, 'getProduct', { id: parseInt(req.params.id) })); }
  catch (err) { res.status(404).json({ error: 'Produit non trouve' }); }
});
app.post('/orders', async (req, res) => {
  try { res.json(await grpcCall(ordersClient, 'createOrder', req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/orders', async (req, res) => {
  try { res.json((await grpcCall(ordersClient, 'listOrders', {})).orders); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/orders/:id', async (req, res) => {
  try { res.json(await grpcCall(ordersClient, 'getOrder', { id: parseInt(req.params.id) })); }
  catch (err) { res.status(404).json({ error: 'Commande non trouvee' }); }
});
app.get('/notifications', async (req, res) => {
  try { res.json((await grpcCall(notifsClient, 'getNotifications', {})).notifications); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

const typeDefs = `
  type Product { id: Int name: String description: String price: Float stock: Int }
  type Order { id: Int product_id: Int quantity: Int customer_name: String status: String }
  type Notification { id: String message: String type: String created_at: String }
  type Query {
    products: [Product]
    product(id: Int!): Product
    orders: [Order]
    order(id: Int!): Order
    notifications: [Notification]
  }
  type Mutation {
    createProduct(name: String!, description: String!, price: Float!, stock: Int!): Product
    createOrder(product_id: Int!, quantity: Int!, customer_name: String!): Order
  }
`;

const resolvers = {
  Query: {
    products: () => grpcCall(productsClient, 'listProducts', {}).then(r => r.products),
    product: (_, { id }) => grpcCall(productsClient, 'getProduct', { id }),
    orders: () => grpcCall(ordersClient, 'listOrders', {}).then(r => r.orders),
    order: (_, { id }) => grpcCall(ordersClient, 'getOrder', { id }),
    notifications: () => grpcCall(notifsClient, 'getNotifications', {}).then(r => r.notifications),
  },
  Mutation: {
    createProduct: (_, args) => grpcCall(productsClient, 'createProduct', args),
    createOrder: (_, args) => grpcCall(ordersClient, 'createOrder', args),
  }
};

async function main() {
  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
  app.use('/graphql', expressMiddleware(server));

  app.listen(3000, () => {
    console.log('API Gateway demarree sur http://localhost:3000');
    console.log('GraphQL sur http://localhost:3000/graphql');
  });
}

main().catch(console.error);