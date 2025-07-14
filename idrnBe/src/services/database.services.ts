import * as mongodb from 'mongodb';
import { DisasterData } from '../interfaces/disasterData';

export const collections: {
    disasterData?: mongodb.Collection<DisasterData>;
} = {};

let client: mongodb.MongoClient | null = null; // Store the client instance

export async function connectToDatabase(uri: string): Promise<void> {
    if (client) {
        console.log("Reusing existing database connection.");
        return; // Reuse existing connection
    }

    client = new mongodb.MongoClient(uri);
    await client.connect();
    console.log("Successfully connected to database.");
}

export async function setupCollections(): Promise<void> {
    if (!client) {
        throw new Error("Database client not initialized. Call connectToDatabase first.");
    }

    const dbName = process.env.DB_NAME;
    if (!dbName) {
        throw new Error("DB_NAME environment variable not set.");
    }
    const db = client.db(dbName);

    const disasterDataCollection = db.collection<DisasterData>("disasterData");
    
    collections.disasterData = disasterDataCollection;
    
    console.log("Collections initialized.");
}

// Function to get the client (for use in other controllers if needed)
export function getDbClient(): mongodb.MongoClient | null {
    return client;
}
