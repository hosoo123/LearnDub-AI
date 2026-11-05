import type { SubtitleSegment } from "./subtitle-parser";

export type SavedLesson = {
  id: string;
  videoName?: string;
  subtitleName?: string;
  segments: SubtitleSegment[];
  duration: number;
  currentTime: number;
  updatedAt: number;
};

export type LoadedLesson = {
  lesson: SavedLesson;
  video?: Blob;
};

const DATABASE_NAME = "learndub-ai";
const DATABASE_VERSION = 1;
const LESSONS_STORE = "lessons";
const VIDEOS_STORE = "videos";

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Энэ браузер локал хичээл хадгалах боломжгүй байна."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LESSONS_STORE)) {
        database.createObjectStore(LESSONS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(VIDEOS_STORE)) {
        database.createObjectStore(VIDEOS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Локал хичээлийн санг нээж чадсангүй."));
    request.onblocked = () => reject(new Error("Хичээлийн сан шинэчлэгдэж байна. Бусад LearnDub цонхыг хаагаад дахин оролдоно уу."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Локал хичээлийн сангийн үйлдэл амжилтгүй боллоо."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Локал хичээлийн сангийн үйлдлийг цуцаллаа."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Локал хичээлийн сангаас уншиж чадсангүй."));
  });
}

function closeWhenDone<T>(database: IDBDatabase, operation: Promise<T>): Promise<T> {
  return operation.finally(() => database.close());
}

export async function listSavedLessons(): Promise<SavedLesson[]> {
  const database = await openDatabase();
  const transaction = database.transaction(LESSONS_STORE, "readonly");
  const done = transactionComplete(transaction);
  const operation = Promise.all([
    requestResult(transaction.objectStore(LESSONS_STORE).getAll() as IDBRequest<SavedLesson[]>),
    done,
  ]).then(([lessons]) => lessons.sort((first, second) => second.updatedAt - first.updatedAt));
  return closeWhenDone(database, operation);
}

export async function loadSavedLesson(id: string): Promise<LoadedLesson | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction([LESSONS_STORE, VIDEOS_STORE], "readonly");
  const done = transactionComplete(transaction);
  const lessonRequest = requestResult(transaction.objectStore(LESSONS_STORE).get(id) as IDBRequest<SavedLesson | undefined>);
  const videoRequest = requestResult(transaction.objectStore(VIDEOS_STORE).get(id) as IDBRequest<{ id: string; blob: Blob } | undefined>);
  const operation = Promise.all([lessonRequest, videoRequest, done])
    .then(([lesson, videoRecord]) => lesson ? { lesson, ...(videoRecord ? { video: videoRecord.blob } : {}) } : undefined);
  return closeWhenDone(database, operation);
}

export async function saveLesson(lesson: SavedLesson): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(LESSONS_STORE, "readwrite");
  const done = transactionComplete(transaction);
  transaction.objectStore(LESSONS_STORE).put(lesson);
  await closeWhenDone(database, done);
}

export async function saveLessonVideo(id: string, video: Blob): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(VIDEOS_STORE, "readwrite");
  const done = transactionComplete(transaction);
  transaction.objectStore(VIDEOS_STORE).put({ id, blob: video });
  await closeWhenDone(database, done);
}

export async function deleteSavedLesson(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([LESSONS_STORE, VIDEOS_STORE], "readwrite");
  const done = transactionComplete(transaction);
  transaction.objectStore(LESSONS_STORE).delete(id);
  transaction.objectStore(VIDEOS_STORE).delete(id);
  await closeWhenDone(database, done);
}
