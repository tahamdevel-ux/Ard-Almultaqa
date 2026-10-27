export interface CapacityInput {
  capacity: number;
  bookings: { ready: boolean; missing: string[] }[];
}
export function tripCounter(i: CapacityInput) {
  const registered = i.bookings.length;
  const ready = i.bookings.filter((b) => b.ready).length;
  const missing = i.bookings.reduce((n, b) => n + b.missing.length, 0);
  return { registered, capacity: i.capacity, ready, missing, free: i.capacity - registered, over: registered > i.capacity };
}
