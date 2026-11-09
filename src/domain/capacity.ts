export interface CapacityInput {
  capacity: number;
  bookings: { ready: boolean }[];
}
export function tripCounter(i: CapacityInput) {
  const registered = i.bookings.length;
  const ready = i.bookings.filter((b) => b.ready).length;
  return { registered, capacity: i.capacity, ready, free: i.capacity - registered, over: registered > i.capacity };
}
