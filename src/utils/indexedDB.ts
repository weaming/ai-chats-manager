import { openDB, type DBSchema } from 'idb';

interface MyDB extends DBSchema {
  'keyval': {
    key: string;
    value: FileSystemDirectoryHandle;
  };
}

const dbPromise = openDB<MyDB>('gemini-screenshot-db', 1, {
  upgrade(db) {
    db.createObjectStore('keyval');
  },
});

export async function set(key: string, val: FileSystemDirectoryHandle) {
  return (await dbPromise).put('keyval', val, key);
}

export async function get(key: string): Promise<FileSystemDirectoryHandle | undefined> {
  return (await dbPromise).get('keyval', key);
}
