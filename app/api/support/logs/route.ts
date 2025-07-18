import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy, limit, where, deleteDoc, Timestamp, doc, getDoc, setDoc, addDoc } from "firebase/firestore";

export async function GET(request: Request) {
  try {
    console.log("API: Fetching system logs...");
    
    // Fetch logs from Firestore without requiring authentication
    const logsCollection = collection(db, "systemLogs");
    const logsQuery = query(
      logsCollection,
      orderBy("timestamp", "desc"),
      limit(100) // Limit to 100 most recent logs
    );
    
    const logsSnapshot = await getDocs(logsQuery);
    
    // If there are no logs, return an empty array
    if (logsSnapshot.empty) {
      console.log("API: No logs found");
      return NextResponse.json([], { status: 200 });
    }
    
    // Convert documents to log objects
    const logs = logsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        timestamp: data.timestamp?.toDate?.() || data.timestamp,
        action: data.action || "unknown action",
        user: data.user || "unknown user",
        details: data.details || {}
      };
    });
    
    console.log(`API: Retrieved ${logs.length} system logs`);
    
    return NextResponse.json(logs, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch system logs" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {    
    console.log("API: Received request to clear logs");
    const requestData = await request.json();
    const { startDate, endDate, userId } = requestData;
    
    // Check Firebase token in Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: "Authentication token missing" }, { status: 401 });
    }
    const token = authHeader.substring(7); // Remove "Bearer "
    if (!token) {
      return NextResponse.json({ error: "Invalid authentication token" }, { status: 401 });
    }
    
    // Check if userId was provided
    if (!userId) {
      return NextResponse.json({ error: "User ID not provided" }, { status: 400 });
    }
    
    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Start and end dates are required" }, { status: 400 });
    }    const startDateTime = new Date(startDate);
    startDateTime.setHours(0, 0, 0, 0); // Set to start of the day
    const endDateTime = new Date(endDate);
    endDateTime.setHours(23, 59, 59, 999); // Set to end of the day
    
    console.log(`Clearing logs from ${startDateTime.toISOString()} to ${endDateTime.toISOString()}`);
    
    // Converting to Firestore Timestamps
    const startTimestamp = Timestamp.fromDate(startDateTime);
    const endTimestamp = Timestamp.fromDate(endDateTime);
    
    console.log(`Start timestamp: ${JSON.stringify(startTimestamp)}, End timestamp: ${JSON.stringify(endTimestamp)}`);    const logsCollection = collection(db, "systemLogs");
    
    // Create a proper query with date filters
    const logsQuery = query(
      logsCollection,
      where("timestamp", ">=", startTimestamp),
      where("timestamp", "<=", endTimestamp)
    );
    
    // This will now only return logs within the date range

    const logsSnapshot = await getDocs(logsQuery);

    if (logsSnapshot.empty) {
      return NextResponse.json({ message: "No logs found in the specified date range" }, { status: 200 });
    }

    // Log IDs and timestamps of found documents
    console.log(`Found ${logsSnapshot.size} logs to delete:`);
    logsSnapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      console.log(`ID: ${docSnap.id}, timestamp:`, data.timestamp);
    });

    const deletePromises = logsSnapshot.docs.map(doc => deleteDoc(doc.ref));

    await Promise.all(deletePromises);

    const logsCount = logsSnapshot.size;    try {
      const systemLogsCollection = collection(db, "systemLogs");
      const newLogData = {
        timestamp: Timestamp.now(),
        action: "logs_cleaned",
        user: userId,
        details: {
          startDate: startDate,
          endDate: endDate,
          logsRemoved: logsCount,
          cleanedAt: new Date().toISOString()
        }
      };
      await addDoc(systemLogsCollection, newLogData);
    } catch (logError) {
      console.error("Error logging clearance action:", logError);
      // Do not interrupt flow due to audit log failure
    }

    return NextResponse.json({ 
      message: `${logsCount} logs successfully removed` 
    }, { status: 200 });
  } catch (error) {
    console.error("API Error during log clearance:", error);
    return NextResponse.json({ error: "Failed to delete system logs" }, { status: 500 });
  }
}

