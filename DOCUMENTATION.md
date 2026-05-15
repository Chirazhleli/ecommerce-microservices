# Documentation Technique — Ecommerce Microservices

## Architecture
Client → API Gateway (REST/GraphQL) → Microservices (gRPC) → Bases de données
                                    ↕ Kafka entre microservices

## Topics Kafka
| Topic | Producteur | Consommateur | Contenu |
|-------|-----------|--------------|---------|
| product-created | Products | Orders | id, name, price, stock |
| order-created | Orders | Notifications | id, product_id, quantity, customer_name |

## Endpoints REST
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | /products | Créer un produit |
| GET | /products | Lister les produits |
| GET | /products/:id | Obtenir un produit |
| POST | /orders | Créer une commande |
| GET | /orders | Lister les commandes |
| GET | /orders/:id | Obtenir une commande |
| GET | /notifications | Lister les notifications |

## Schéma GraphQL
```graphql
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
```

## Bases de données
- **Products** : SQLite3 — `products.db` (id, name, description, price, stock)
- **Orders** : SQLite3 — `orders.db` (id, product_id, quantity, customer_name, status)
- **Notifications** : RxDB in-memory (id, message, type, created_at)

## Fichiers .proto
- `proto/products.proto` — ProductService (CreateProduct, GetProduct, ListProducts)
- `proto/orders.proto` — OrderService (CreateOrder, GetOrder, ListOrders)
- `proto/notifications.proto` — NotificationService (GetNotifications)

## Installation et exécution
```bash
# Terminal 1
cd microservice-products && node index.js

# Terminal 2
cd microservice-orders && node index.js

# Terminal 3
cd microservice-notifications && node index.js

# Terminal 4
cd api-gateway && node index.js
```

## Ports
- API Gateway : http://localhost:3000
- GraphQL Playground : http://localhost:3000/graphql
- Products gRPC : 50051
- Orders gRPC : 50052
- Notifications gRPC : 50053