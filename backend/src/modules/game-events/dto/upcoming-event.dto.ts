export interface UpcomingEventDto {
  id: string;
  worldId: string;
  worldName: string;
  worldSlug: string;
  title: string;
  date: string;
  confirmable: boolean;
  myRsvp: 'confirmed' | 'none';
  confirmedCount: number;
}
