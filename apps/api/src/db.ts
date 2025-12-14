import { Collection, Db, MongoClient } from "mongodb";
import { ImportJob } from "@shared/types";

let client: MongoClient | null = null;
let db: Db | null = null;
let importJobsCollection: Collection<ImportJob> | null = null;

function getMongoUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }
  return uri;
}

export async function getMongoClient() {
  if (!client) {
    client = new MongoClient(getMongoUri());
    await client.connect();
  }
  return client;
}

export async function getDb() {
  if (!db) {
    const mongoClient = await getMongoClient();
    const dbName = process.env.MONGODB_DB;
    db = mongoClient.db(dbName);
  }
  return db;
}

export async function getImportJobsCollection() {
  if (!importJobsCollection) {
    const database = await getDb();
    importJobsCollection = database.collection<ImportJob>("import_jobs");
    await importJobsCollection.createIndexes([
      { key: { status: 1 } },
      { key: { created_at: -1 } },
    ]);
  }
  return importJobsCollection;
}

export async function disconnectMongo() {
  if (client) {
    await client.close();
  }
  client = null;
  db = null;
  importJobsCollection = null;
}
