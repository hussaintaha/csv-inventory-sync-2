import csvParser from "csv-parser";
import path from "path";
import fs from "fs";
import { graphqlRequest } from "../component/graphqlRequest";
import ftp from "basic-ftp";
import { finished } from "stream/promises";
import { Readable, Writable } from "stream";

const {
    FTP_HOST,
    FTP_PORT,
    FTP_USER,
    FTP_PASSWORD,
} = process.env;

// parseCSV from local
// async function parseCsv(filePath) {
//     const results = [];

//     // const file = fs.readFileSync(filePath, "utf8");
//     // const lines = file.split(/\r\n|\n/);
//     // console.log("Total lines in file:", lines.length);
//     // live store products sku: AV1645501,MI567465
//     const parser = fs
//         .createReadStream(filePath)
//         .pipe(csvParser({
//             separator: ";",
//             headers: false,
//             quote: "",        // disabling quotes
//             skipComments: false,
//             strict: false
//         }));

//     parser.on("data", row => results.push(row));
//     await finished(parser);
//     console.log("Parsed records:", results.length);
//     return results.map(r => ({ sku: r[2], qty: r[3] }));
// }

const LOCAL_CSV_PATH = path.join(process.cwd(), "public", "CSV", "ic_ean_CSV.csv");

async function downloadCsvFromFtp() {
    const client = new ftp.Client();
    const dir = path.dirname(LOCAL_CSV_PATH);

    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        await client.access({
            host: FTP_HOST,
            port: FTP_PORT,
            user: FTP_USER,
            password: FTP_PASSWORD,
            secure: false,
        });

        await client.downloadTo(LOCAL_CSV_PATH, "/ic_ean_CSV.csv");
        console.log("From downloadCsvFromFtp, downloaded CSV to:", LOCAL_CSV_PATH);
    } catch (error) {
        console.error("FTP download error from downloadCsvFromFtp:", error);
        throw error;
    } finally {
        client.close();
    }
}

async function processCsvStreamed(shopData) {
    return new Promise((resolve, reject) => {
        let count = 0;

        const stream = fs.createReadStream(LOCAL_CSV_PATH)
            .pipe(csvParser({ separator: ";" }))

        stream.on("data", async (row) => {
            stream.pause();
            const sku = row["PRODUCT_CODE"];
            const qty = parseInt(row["TOTAL"], 10) || 0;
            count++;

            if (!sku) {
                stream.resume();
                return;
            }

            try {
                const productSKUQuery = `
                        query ProductVariantsList {
                            productVariants(first: 10, query: "sku:${sku}") {
                                nodes {
                                    id
                                    title
                                    inventoryQuantity
                                    inventoryItem {
                                        id
                                        inventoryLevels(first: 10) {
                                            edges {
                                                node {
                                                    id
                                                    location {
                                                        id
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                pageInfo {
                                    startCursor
                                    endCursor
                                }
                            }
                        }
                    `;

                const dataOfProductSKU = await graphqlRequest(shopData, productSKUQuery);
                // console.log("data=================>", data);
                // console.log("dataOfProductSKU=================>", dataOfProductSKU.data.productVariants.nodes.length);
                console.log("count from sync_ftp_csv_Products =============> ", count);

                if (dataOfProductSKU.data.productVariants.nodes.length == 1) {
                    const inventoryItemID = dataOfProductSKU.data.productVariants.nodes[0].inventoryItem.id;
                    const locationID = dataOfProductSKU.data.productVariants.nodes[0].inventoryItem.inventoryLevels.edges[0].node.location.id;
                    const delta = qty - dataOfProductSKU.data.productVariants.nodes[0].inventoryQuantity;
                    console.log("inventoryItemID=================>", inventoryItemID);
                    console.log("locationID=================>", locationID);
                    console.log("delta:", delta);
                    if (delta) {
                        console.log("Delta is not zero, updating inventory of sku:", sku);
                    } else {
                        console.log("Delta is zero, no need to update inventory of sku:", sku);
                    }

                    // if (locationID) {

                    //     const inventoryAdjustmentMutation = `
                    //         mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
                    //             inventoryAdjustQuantities(input: $input) {
                    //                 userErrors {
                    //                     field
                    //                     message
                    //                 }
                    //                 inventoryAdjustmentGroup {
                    //                     createdAt
                    //                     reason
                    //                     changes {
                    //                         name
                    //                         delta
                    //                     }
                    //                 }
                    //             }
                    //         }
                    //     `;

                    //     await graphqlRequest(shopData, inventoryAdjustmentMutation, {
                    //         variables: {
                    //             input: {
                    //                 reason: "correction",
                    //                 name: "available",
                    //                 changes: [
                    //                     {
                    //                         delta,
                    //                         inventoryItemId: inventoryItemID,
                    //                         locationId: locationID
                    //                     }
                    //                 ]
                    //             }
                    //         }
                    //     });
                    // }
                } else if (dataOfProductSKU.data.productVariants.nodes.length > 1) {
                    console.log("Multiple variants found hence not updating quantity for SKU:", sku);
                } else {
                    console.log("No variant found for SKU:", sku);
                }
            } catch (err) {
                console.error(`From sync_ftp_csv_Products error processing SKU ${sku}:`, err);
            }
            stream.resume();
        })
        stream.on("end", () => {
            console.log(`✅ Finished streaming. Total rows processed: ${count}`);
            resolve();
        })
        stream.on("error", (error) => {
            console.error("CSV streaming error from sync_ftp_csv_Products :", error);
            reject(error);
        });
    });
}

export const loader = async () => {
    try {
        const shopData = [{
            shop: "mjfdah-nh.myshopify.com",
            accessToken: process.env.SHOPIFY_ACCESS_TOKEN
        }];
        console.log("API triggered of sync_ftp_csv_Products, shopData............", shopData);

        await downloadCsvFromFtp();
        await processCsvStreamed(shopData);

        return { success: true };
    } catch (error) {
        console.error("Loader error from sync_ftp_csv_Products:", error);
        return { error }, { status: 500 };
    }
};














// async function parseCsvFromftp() {
//     const results = [];
//     const client = new ftp.Client();
//     client.ftp.verbose = true;

//     try {
//         await client.access({
//             host: FTP_HOST,
//             port: FTP_PORT,
//             user: FTP_USER,
//             password: FTP_PASSWORD,
//             secure: false,
//         });

//         const chunks = [];
//         const writableStream = new Writable({
//             write(chunk, encoding, callback) {
//                 chunks.push(chunk);
//                 callback();
//             }
//         });


//         await client.downloadTo(writableStream, "/ic_ean_CSV.csv");

//         const buffer = Buffer.concat(chunks);

//         const readableStream = Readable.from(buffer);
//         readableStream
//             .pipe(
//                 csvParser({
//                     separator: ";",
//                 })
//             )
//             .on("data", (row) => results.push(row));

//         await finished(readableStream);

//         console.log("Parsed records from parseCsvFromftp:", results.length);
//         return results.map((r) => ({
//             sku: r["PRODUCT_CODE"],
//             qty: r["TOTAL"],
//         }));
//     } catch (error) {
//         console.log("error occurred from parseCsvFromftp on FTP CSV read:", error);
//     } finally {
//         client.close();
//     }
// }


// export const loader = async ({ request }) => {
//     try {
//         // const shopData = await prisma.session.findMany();
//         const shopData = [{
//             shop: "mjfdah-nh.myshopify.com",
//             accessToken: process.env.SHOPIFY_ACCESS_TOKEN
//         }]
//         console.log('shopData===================>', shopData);
//         if (!shopData.length) return json({ message: "No shop data found." });

//         const results = await parseCsvFromftp();
//         // const filePath = path.join(
//         //     process.cwd(),
//         //     "public",
//         //     "csv",
//         //     "variantSKU.csv"
//         // );
//         const skuMap = results.reduce((map, row) => {
//             const qty = parseInt(row.qty, 10) || 0;
//             map[row.sku] = (map[row.sku] || 0) + qty;
//             return map;
//         }, {});

//         // return { results, skuMap: Object.entries(skuMap) }
//         let count = 0;
//         for (const [sku, qty] of Object.entries(skuMap)) {
//             count++
//             const productSKUQuery = `
//                 query ProductVariantsList {
//                     productVariants(first: 10, query: "sku:${sku}") {
//                         nodes {
//                             id
//                             title
//                             inventoryQuantity
//                             inventoryItem {
//                                 id
//                                 inventoryLevels(first: 10) {
//                                     edges {
//                                         node {
//                                             id
//                                             location {
//                                                 id
//                                             }
//                                         }
//                                     }
//                                 }
//                             }
//                         }
//                         pageInfo {
//                             startCursor
//                             endCursor
//                         }
//                     }
//                 }
//             `;

//             const dataOfProductSKU = await graphqlRequest(shopData, productSKUQuery);
//             // console.log("data=================>", data);
//             // console.log("dataOfProductSKU=================>", dataOfProductSKU.data.productVariants.nodes.length);
//             console.log("count----->", count);

//             if (dataOfProductSKU.data.productVariants.nodes.length == 1) {
//                 const inventoryItemID = dataOfProductSKU.data.productVariants.nodes[0].inventoryItem.id;
//                 const locationID = dataOfProductSKU.data.productVariants.nodes[0].inventoryItem.inventoryLevels.edges[0].node.location.id;
//                 const delta = qty - dataOfProductSKU.data.productVariants.nodes[0].inventoryQuantity;
//                 console.log("inventoryItemID=================>", inventoryItemID);
//                 console.log("locationID=================>", locationID);
//                 console.log("delta=================>", delta);
//                 if (delta) {
//                     console.log("Delta is not zero, updating inventory...");
//                 } else {
//                     console.log("Delta is zero, no need to update inventory.");
//                 }


//                 // if (locationID) {

//                 //     const inventoryAdjustmentMutation = `
//                 //         mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
//                 //             inventoryAdjustQuantities(input: $input) {
//                 //                 userErrors {
//                 //                     field
//                 //                     message
//                 //                 }
//                 //                 inventoryAdjustmentGroup {
//                 //                     createdAt
//                 //                     reason
//                 //                     changes {
//                 //                         name
//                 //                         delta
//                 //                     }
//                 //                 }
//                 //             }
//                 //         }
//                 //     `;

//                 //     await graphqlRequest(shopData, inventoryAdjustmentMutation, {
//                 //         variables: {
//                 //             input: {
//                 //                 reason: "correction",
//                 //                 name: "available",
//                 //                 changes: [
//                 //                     {
//                 //                         delta,
//                 //                         inventoryItemId: inventoryItemID,
//                 //                         locationId: locationID
//                 //                     }
//                 //                 ]
//                 //             }
//                 //         }
//                 //     });
//                 // }
//             } else if (dataOfProductSKU.data.productVariants.nodes.length > 1) {
//                 console.log("Multiple variants found hence not updating quantity for SKU:", sku);
//             } else {
//                 console.log("No variant found for SKU:", sku);
//             }
//         }
//         // console.log("CSV parsed from sync_ftp_csv_Products:", results);

//         return { consolidatedData, results };
//     } catch (error) {
//         console.error("error reading CSV from sync_ftp_csv_Products:", error);
//         return { error: error.message }, { status: 500 };
//     }
// };
