import express, { Request, Response, NextFunction } from 'express';
import * as dotenv from 'dotenv';
dotenv.config(); // Load .env FIRST!
import cors from 'cors';
import MongoStore from 'connect-mongo'; // For storing sessions in MongoDB

import { connectToDatabase, setupCollections, collections } from './services/database.services'; // Import setupCollections
import { disasterData } from './data';


const app = express();

app.use(cors({
    origin: ['http://localhost:4200', 'http://127.0.0.1:4200'], // Adjust as needed
    credentials: true,
}));

app.use(express.json());

async function main() {
    try {
        // Connect to the database (singleton pattern)
        await connectToDatabase(process.env.ATLAS_URI!);

        // Setup collections *after* connecting
        await setupCollections(); // Call setupCollections here

        console.log("Database connection and collections initialized.");

        // Insert data into the disasterData collection
        if (collections.disasterData) {
            await collections.disasterData.deleteMany({});
            await collections.disasterData.insertMany(disasterData);
            console.log("Disaster data inserted.");
        }

        app.get('/api/disaster-data', async (req: Request, res: Response) => {
            try {
                if (collections.disasterData) {
                    const data = await collections.disasterData.find({}).toArray();
                    res.status(200).send(data);
                } else {
                    res.status(500).send("disasterData collection not found.");
                }
            } catch (error) {
                res.status(500).send(error.message);
            }
        });


                const port = process.env.PORT || 3000;
        app.listen(Number(port), '0.0.0.0', () => {
            console.log(`Server running at http://localhost:${port}`);
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Unexpected error occurred:', error);
    process.exit(1);
});
