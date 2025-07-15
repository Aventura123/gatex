import { NextRequest, NextResponse } from "next/server";
import { initAdmin } from "../../../lib/firebaseAdmin";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";

// Initialize Firebase Admin
initAdmin();

// Get Firebase Admin services
const adminStorage = getStorage();
const adminDb = getFirestore();

export async function POST(req: NextRequest) {
  console.log("Iniciando processo de upload...");

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const userId = formData.get("userId") as string | null;

    if (!file || !userId) {
      console.error("Requisição inválida: file ou userId ausente.");
      return NextResponse.json({ 
        error: "Invalid request", 
        message: "File and userId are required" 
      }, { status: 400 });
    }

    console.log("Iniciando upload de foto para usuário:", userId);
    console.log("Tipo de arquivo:", file.type);
    console.log("Tamanho do arquivo:", file.size, "bytes");

    // Verificar tamanho do arquivo (limitar a 5MB)
    if (file.size > 5 * 1024 * 1024) {
      console.error("Arquivo muito grande. Tamanho máximo permitido: 5MB.");
      return NextResponse.json({ 
        error: "File too large", 
        message: "File size must be less than 5MB" 
      }, { status: 400 });
    }

    // Verificar tipo de arquivo (apenas imagens)
    if (!file.type.startsWith("image/")) {
      console.error("Tipo de arquivo inválido. Apenas imagens são permitidas.");
      return NextResponse.json({ 
        error: "Invalid file type", 
        message: "Only image files are allowed" 
      }, { status: 400 });
    }

    // Convertendo o arquivo para buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log("Buffer gerado com sucesso.");

    // Gerando um nome único para o arquivo
    const fileExtension = file.name.split('.').pop();
    const fileName = `${uuidv4()}.${fileExtension}`;
    console.log("Nome do arquivo gerado:", fileName);

    let downloadURL;
    let filePath;

    try {
      // Upload para Firebase Storage usando Admin SDK
      filePath = `user-photos/${userId}/${fileName}`;
      console.log("Gerando referência para:", filePath);

      // Usar o bucket name definido na configuração
      const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
      console.log("Bucket name:", bucketName);
      
      if (!bucketName) {
        throw new Error("Storage bucket não está configurado. Verifique NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.");
      }
      
      const bucket = adminStorage.bucket(bucketName);
      const fileRef = bucket.file(filePath);

      console.log("Iniciando upload para Firebase Storage...");
      
      // Upload do arquivo
      await fileRef.save(buffer, {
        metadata: {
          contentType: file.type,
        },
      });

      console.log("Upload concluído, tornando arquivo público...");
      
      // Tornar o arquivo público
      await fileRef.makePublic();

      // Obter URL de download
      downloadURL = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
      console.log("URL de download obtida:", downloadURL);

    } catch (storageError: any) {
      console.error("Detailed Firebase Storage Error:", JSON.stringify(storageError, null, 2));
      console.error("Erro no Firebase Storage:", storageError.code, storageError.message);
      throw new Error(`Falha ao fazer upload para o Firebase Storage. Code: ${storageError.code}. Message: ${storageError.message}. Verifique as configurações e permissões.`);
    }

    // Salvando a URL da imagem no Firestore associada ao usuário
    const collections = ["admins", "employers", "seekers"];
    let userDoc = null;
    let collectionName = "";

    for (const collection of collections) {
      const userRef = adminDb.collection(collection).doc(userId);
      const docSnapshot = await userRef.get();
      
      if (docSnapshot.exists) {
        userDoc = docSnapshot;
        collectionName = collection;
        break;
      }
    }

    // Se encontrou o usuário, atualiza o documento
    if (userDoc) {
      const userRef = adminDb.collection(collectionName).doc(userId);
      await userRef.update({
        photoURL: downloadURL,
        photoPath: filePath,
        updatedAt: new Date().toISOString()
      });
      
      console.log(`Foto do usuário atualizada no Firestore (coleção: ${collectionName})`);
    } else {
      console.log("Usuário não encontrado no Firestore, criando registro na coleção 'users'");
      const userRef = adminDb.collection("users").doc(userId);
      await userRef.set({
        photoURL: downloadURL,
        photoPath: filePath,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
    }

    return NextResponse.json({ 
      success: true, 
      url: downloadURL,
      storageMethod: "firebase-admin"
    }, { status: 200 });
    
  } catch (error: any) {
    console.error("Erro durante o upload:", error.message, error.stack);
    return NextResponse.json({
      error: "Upload failed",
      message: error.message || "An unknown error occurred during file upload"
    }, { status: 500 });
  }
}