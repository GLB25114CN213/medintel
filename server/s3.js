import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let s3Client = null;

function getS3Client() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || "ap-south-1";

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: accessKeyId.trim(),
        secretAccessKey: secretAccessKey.trim(),
      },
    });
  }

  return s3Client;
}

export async function uploadToS3(fileBuffer, originalFilename, mimeType) {
  const bucketName = process.env.AWS_S3_BUCKET_NAME;
  const client = getS3Client();

  if (!client || !bucketName) {
    console.log("ℹ️ AWS S3 credentials or AWS_S3_BUCKET_NAME not set. Skipping S3 upload.");
    return { success: false, url: null, reason: "S3_NOT_CONFIGURED" };
  }

  try {
    const fileExt = originalFilename ? originalFilename.split(".").pop() : "bin";
    const sanitizeName = (originalFilename || "report").replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `medical-reports/${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${sanitizeName}`;

    const command = new PutObjectCommand({
      Bucket: bucketName.trim(),
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType || "application/octet-stream",
    });

    await client.send(command);

    const region = process.env.AWS_REGION || "ap-south-1";
    const s3Url = `https://${bucketName.trim()}.s3.${region}.amazonaws.com/${key}`;

    console.log(`✅ Medical report uploaded to AWS S3: ${s3Url}`);
    return { success: true, url: s3Url, key };
  } catch (e) {
    console.error("❌ AWS S3 Upload Error:", e.message);
    return { success: false, url: null, error: e.message };
  }
}
