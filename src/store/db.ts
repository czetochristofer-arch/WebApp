import { Repair, SmallOrder } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { firestore } from '../lib/firebase';
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, getDoc, query, orderBy } from 'firebase/firestore';

class FirebaseDB {
  private repairsCollection = collection(firestore, 'repairs');
  private smallOrdersCollection = collection(firestore, 'smallOrders');

  // Repairs
  async getRepairs(): Promise<Repair[]> {
    try {
      const q = query(this.repairsCollection);
      const snapshot = await getDocs(q);
      const repairs: Repair[] = [];
      snapshot.forEach(doc => {
        repairs.push(doc.data() as Repair);
      });
      // Sort by date descending in memory for simplicity, or could use orderBy in query
      return repairs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch (error) {
      console.error("Error getting repairs:", error);
      return [];
    }
  }

  async addRepair(repair: Omit<Repair, 'id' | 'displayId'>): Promise<Repair> {
    const newRepair: Repair = {
      ...repair,
      id: uuidv4(),
      displayId: `#${Math.floor(1000 + Math.random() * 9000)}`
    };
    await setDoc(doc(this.repairsCollection, newRepair.id), newRepair);
    return newRepair;
  }

  async updateRepair(id: string, updates: Partial<Repair>): Promise<Repair> {
    const repairRef = doc(this.repairsCollection, id);
    await updateDoc(repairRef, updates);
    const updatedDoc = await getDoc(repairRef);
    return updatedDoc.data() as Repair;
  }

  async getRepairById(id: string): Promise<Repair | undefined> {
    const repairRef = doc(this.repairsCollection, id);
    const snapshot = await getDoc(repairRef);
    if (snapshot.exists()) {
      return snapshot.data() as Repair;
    }
    return undefined;
  }

  async deleteRepair(id: string): Promise<void> {
    await deleteDoc(doc(this.repairsCollection, id));
  }

  // Small Orders
  async getSmallOrders(): Promise<SmallOrder[]> {
    try {
      const q = query(this.smallOrdersCollection);
      const snapshot = await getDocs(q);
      const orders: SmallOrder[] = [];
      snapshot.forEach(doc => {
        orders.push(doc.data() as SmallOrder);
      });
      return orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      console.error("Error getting small orders:", error);
      return [];
    }
  }

  async addSmallOrder(order: Omit<SmallOrder, 'id' | 'createdAt'>): Promise<SmallOrder> {
    const newOrder: SmallOrder = {
      ...order,
      id: uuidv4(),
      createdAt: new Date().toISOString()
    };
    await setDoc(doc(this.smallOrdersCollection, newOrder.id), newOrder);
    return newOrder;
  }

  async updateSmallOrder(id: string, updates: Partial<SmallOrder>): Promise<SmallOrder> {
    const orderRef = doc(this.smallOrdersCollection, id);
    await updateDoc(orderRef, updates);
    const updatedDoc = await getDoc(orderRef);
    return updatedDoc.data() as SmallOrder;
  }

  async deleteSmallOrder(id: string): Promise<void> {
    await deleteDoc(doc(this.smallOrdersCollection, id));
  }
}

export const db = new FirebaseDB();
