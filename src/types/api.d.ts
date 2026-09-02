export type Track = {
  id: string;
  filePath: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year?: number;
  duration?: number;
  duplicateGroupId?: string;
};
export type WishlistItem = {
  id: string;
  name: string;
  artist?: string;
  priority: 'High' | 'Medium' | 'Low';
  dateAdded: string;
};
