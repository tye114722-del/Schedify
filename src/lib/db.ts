import { Task } from '@/types';

let dbPromise: Promise<IDBDatabase> | null = null;

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ScheduleManagerDB', 4);
    
    request.onerror = () => {
      reject(request.error);
    };
    
    request.onsuccess = () => {
      resolve(request.result);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion || 0;
      
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains('tasks')) {
          const store = db.createObjectStore('tasks', { keyPath: 'id' });
          store.createIndex('by-date', 'date');
        }
      }
      
      if (oldVersion < 2) {
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (transaction) {
          const store = transaction.objectStore('tasks');
          
          if (!store.indexNames.contains('by-order')) {
            store.createIndex('by-order', 'order');
          }
        }
      }
      
      if (oldVersion < 3) {
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (transaction) {
          const store = transaction.objectStore('tasks');
          
          if (!store.indexNames.contains('by-startDate')) {
            store.createIndex('by-startDate', 'startDate');
          }
          
          if (!store.indexNames.contains('by-endDate')) {
            store.createIndex('by-endDate', 'endDate');
          }
          
          if (!store.indexNames.contains('by-deadline')) {
            store.createIndex('by-deadline', 'deadline');
          }
        }
      }
      
      if (oldVersion < 4) {
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (transaction) {
          const store = transaction.objectStore('tasks');
          
          const getAllRequest = store.getAll();
          
          getAllRequest.onsuccess = () => {
            const tasks = getAllRequest.result as Task[];
            tasks.forEach(task => {
              const updatedTask: Task = {
                ...task,
                startDate: task.startDate || task.date || '',
                endDate: task.endDate || task.date || '',
                logs: task.logs || [],
                totalDuration: task.totalDuration || 0
              };
              
              store.put(updatedTask);
            });
          };
        }
      }
    };
  });
};

export const db = {
  async getDB() {
    if (!dbPromise) {
      dbPromise = initDB();
    }
    return dbPromise;
  },
  
  async addTask(task: Omit<Task, 'id'>): Promise<Task> {
    const db = await this.getDB();
    const transaction = db.transaction('tasks', 'readwrite');
    const store = transaction.objectStore('tasks');
    
    return new Promise((resolve, reject) => {
      const taskWithDefaults: Task = { 
        ...task, 
        id: Date.now().toString(),
        order: task.order || 0,
        date: task.date || '',
        startDate: task.startDate || task.date || '',
        endDate: task.endDate || task.date || '',
        logs: task.logs || [],
        totalDuration: task.totalDuration || 0,
        completed: task.completed || false,
        isAdHoc: task.isAdHoc || false
      };
      
      const request = store.add(taskWithDefaults);
      
      request.onsuccess = () => {
        resolve(taskWithDefaults);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  },
  
  async getTasksByDate(date: string): Promise<Task[]> {
    const db = await this.getDB();
    const transaction = db.transaction('tasks', 'readonly');
    const store = transaction.objectStore('tasks');
    
    return new Promise((resolve, reject) => {
      const tasks: Task[] = [];
      const seenIds = new Set<string>();
      
      const dateRequest = store.index('by-date').openCursor(IDBKeyRange.only(date));
      
      dateRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          tasks.push(cursor.value);
          seenIds.add(cursor.value.id);
          cursor.continue();
        } else {
          const range = IDBKeyRange.bound('', '\uffff');
          const cursorRequest = store.openCursor(range);
          
          cursorRequest.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              const task = cursor.value;
              
              if (task.startDate && task.endDate) {
                const currentDate = new Date(date).getTime();
                const startDate = new Date(task.startDate).getTime();
                const endDate = new Date(task.endDate).getTime();
                
                if (currentDate >= startDate && currentDate <= endDate && !seenIds.has(task.id)) {
                  tasks.push(task);
                }
              }
              
              cursor.continue();
            } else {
              resolve(tasks.sort((a, b) => (a.order || 0) - (b.order || 0)));
            }
          };
          
          cursorRequest.onerror = () => {
            reject(cursorRequest.error);
          };
        }
      };
      
      dateRequest.onerror = () => {
        reject(dateRequest.error);
      };
    });
  },
  
  async getTasksByDateRange(startDate: string, endDate: string): Promise<Task[]> {
    const db = await this.getDB();
    const transaction = db.transaction('tasks', 'readonly');
    const store = transaction.objectStore('tasks');
    
    return new Promise((resolve, reject) => {
      const tasks: Task[] = [];
      const seenIds = new Set<string>();
      
      const dateRangeRequest = store.index('by-date')
        .openCursor(IDBKeyRange.bound(startDate, endDate));
      
      dateRangeRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          tasks.push(cursor.value);
          seenIds.add(cursor.value.id);
          cursor.continue();
        } else {
          const cursorRequest = store.openCursor();
          
          cursorRequest.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              const task = cursor.value;
              
              if (task.startDate && task.endDate && !seenIds.has(task.id)) {
                const taskStart = new Date(task.startDate).getTime();
                const taskEnd = new Date(task.endDate).getTime();
                const rangeStart = new Date(startDate).getTime();
                const rangeEnd = new Date(endDate).getTime();
                
                if ((taskStart >= rangeStart && taskStart <= rangeEnd) ||
                    (taskEnd >= rangeStart && taskEnd <= rangeEnd) ||
                    (taskStart <= rangeStart && taskEnd >= rangeEnd)) {
                  tasks.push(task);
                }
              }
              
              cursor.continue();
            } else {
              resolve(tasks);
            }
          };
          
          cursorRequest.onerror = () => {
            reject(cursorRequest.error);
          };
        }
      };
      
      dateRangeRequest.onerror = () => {
        reject(dateRangeRequest.error);
      };
    });
  },
  
  async updateTask(task: Task): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction('tasks', 'readwrite');
    const store = transaction.objectStore('tasks');
    
    return new Promise((resolve, reject) => {
      const updatedTask: Task = {
        ...task,
        startDate: task.startDate || task.date || '',
        endDate: task.endDate || task.date || '',
        logs: task.logs || [],
        totalDuration: task.totalDuration || 0
      };
      
      const request = store.put(updatedTask);
      
      request.onsuccess = () => {
        resolve();
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  },
  
  async deleteTask(id: string): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction('tasks', 'readwrite');
    const store = transaction.objectStore('tasks');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      
      request.onsuccess = () => {
        resolve();
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  },
  
  async batchUpdateTaskOrder(tasks: Task[]): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction('tasks', 'readwrite');
    const store = transaction.objectStore('tasks');
    
    return new Promise((resolve, reject) => {
      let completed = 0;
      let hasError = false;
      
      tasks.forEach(task => {
        const updatedTask: Task = {
          ...task,
          startDate: task.startDate || task.date || '',
          endDate: task.endDate || task.date || '',
          logs: task.logs || [],
          totalDuration: task.totalDuration || 0
        };
        
        const request = store.put(updatedTask);
        
        request.onsuccess = () => {
          completed++;
          if (completed === tasks.length && !hasError) {
            resolve();
          }
        };
        
        request.onerror = () => {
          hasError = true;
          reject(request.error);
        };
      });
    });
  },
  
  async getAllTasks(): Promise<Task[]> {
    const db = await this.getDB();
    const transaction = db.transaction('tasks', 'readonly');
    const store = transaction.objectStore('tasks');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      
      request.onsuccess = () => {
        const tasks = request.result.map(task => ({
          ...task,
          startDate: task.startDate || task.date || '',
          endDate: task.endDate || task.date || '',
          logs: task.logs || [],
          totalDuration: task.totalDuration || 0
        }));
        resolve(tasks);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
};