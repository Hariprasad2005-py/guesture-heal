require("dotenv").config({
  path: "./backend/.env",
});

const { MongoClient } = require("mongodb");
const PDFDocument = require("pdfkit");
const fs = require("fs");

const MONGODB_URI = process.env.MONGODB_URI;

// Your current database
const DATABASE_NAME = process.env.MONGODB_DB || "gestureheal";

const OUTPUT_FILE = "GestureHeal-Database-Dump.pdf";

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI was not found in your .env file.");
  process.exit(1);
}

async function exportDatabaseToPDF() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log("🔌 Connecting to MongoDB...");
    await client.connect();

    const db = client.db(DATABASE_NAME);

    console.log(`✅ Connected to database: ${DATABASE_NAME}`);

    // Get all collections in the database
    const collections = await db.listCollections().toArray();

    console.log(`📦 Found ${collections.length} collections`);

    const pdf = new PDFDocument({
      size: "A4",
      margin: 45,
      bufferPages: true,
      info: {
        Title: "GestureHeal Database Dump",
        Author: "GestureHeal",
        Subject: `Complete MongoDB export of ${DATABASE_NAME}`,
      },
    });

    const output = fs.createWriteStream(OUTPUT_FILE);

    pdf.pipe(output);

    // -----------------------------
    // Helper functions
    // -----------------------------

    function addTitle(text) {
      pdf
        .font("Helvetica-Bold")
        .fontSize(18)
        .text(text, {
          align: "center",
        });

      pdf.moveDown();
    }

    function addHeading(text) {
      pdf.moveDown(0.5);

      pdf
        .font("Helvetica-Bold")
        .fontSize(14)
        .text(text);

      pdf.moveDown(0.3);
    }

    function addSmallText(text) {
      pdf
        .font("Helvetica")
        .fontSize(8)
        .text(text);
    }

    function addDocument(documentNumber, data) {
      pdf.moveDown(0.5);

      pdf
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(`Document ${documentNumber}`);

      pdf.moveDown(0.2);

      /*
       * EJSON preserves MongoDB-specific values such as:
       * ObjectId
       * Date
       * Decimal128
       * Binary
       * etc.
       */
      const json = JSON.stringify(
  data,
  (key, value) => {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (
      value &&
      typeof value === "object" &&
      value._bsontype === "ObjectId"
    ) {
      return value.toString();
    }

    return value;
  },
  2
);

      pdf
        .font("Courier")
        .fontSize(7);

      const lines = json.split("\n");

      for (const line of lines) {
        pdf.text(line, {
          continued: false,
          lineGap: 1,
        });
      }

      pdf.moveDown(0.5);

      // Separator
      pdf
        .font("Helvetica")
        .fontSize(7)
        .text("----------------------------------------");
    }

    // -----------------------------
    // Cover page
    // -----------------------------

    addTitle("GESTUREHEAL DATABASE DUMP");

    pdf
      .font("Helvetica")
      .fontSize(11)
      .text(`Database: ${DATABASE_NAME}`, {
        align: "center",
      });

    pdf
      .fontSize(10)
      .text(`Generated: ${new Date().toISOString()}`, {
        align: "center",
      });

    pdf.moveDown(2);

    pdf
      .font("Helvetica")
      .fontSize(10)
      .text(
        "This document contains the exported contents of the MongoDB database, including all collections and documents available to the connected database user."
      );

    pdf.moveDown(1);

    pdf
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("Collections:");

    pdf.moveDown(0.3);

    for (const collection of collections) {
      pdf
        .font("Helvetica")
        .fontSize(9)
        .text(`• ${collection.name}`);
    }

    // -----------------------------
    // Export each collection
    // -----------------------------

    let totalDocuments = 0;

    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;

      console.log(`\n📂 Exporting collection: ${collectionName}`);

      pdf.addPage();

      addHeading(`COLLECTION: ${collectionName}`);

      const collection = db.collection(collectionName);

      const count = await collection.countDocuments();

      console.log(`   Documents: ${count}`);

      addSmallText(`Total documents: ${count}`);
      pdf.moveDown();

      if (count === 0) {
        pdf
          .font("Helvetica")
          .fontSize(9)
          .text("This collection is empty.");

        continue;
      }

      let documentNumber = 0;

      // Cursor prevents loading the entire collection into RAM
      const cursor = collection.find({});

      for await (const document of cursor) {
        documentNumber++;
        totalDocuments++;

        console.log(
          `   Exporting ${documentNumber}/${count}`
        );

        addDocument(documentNumber, document);
      }
    }

    // -----------------------------
    // Add page numbers
    // -----------------------------

    const range = pdf.bufferedPageRange();

    for (
      let pageIndex = range.start;
      pageIndex < range.start + range.count;
      pageIndex++
    ) {
      pdf.switchToPage(pageIndex);

      pdf
        .font("Helvetica")
        .fontSize(7)
        .text(
          `GestureHeal Database Dump | Page ${pageIndex + 1} of ${range.count}`,
          45,
          805,
          {
            align: "center",
            width: 505,
          }
        );
    }

    // -----------------------------
    // Finish PDF
    // -----------------------------

    pdf.end();

    await new Promise((resolve, reject) => {
      output.on("finish", resolve);
      output.on("error", reject);
    });

    console.log("\n========================================");
    console.log("✅ DATABASE PDF CREATED");
    console.log("========================================");
    console.log(`📄 File: ${OUTPUT_FILE}`);
    console.log(`📦 Collections: ${collections.length}`);
    console.log(`📄 Documents: ${totalDocuments}`);
    console.log("========================================\n");

  } catch (error) {
    console.error("\n❌ Export failed:");
    console.error(error);

    process.exitCode = 1;
  } finally {
    await client.close();
    console.log("🔌 MongoDB connection closed.");
  }
}

exportDatabaseToPDF();