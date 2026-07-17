export type StoredBlob = {
  pathname: string;
  url: string;
  downloadUrl?: string;
  size: number;
  uploadedAt: string;
  contentType?: string;
  backend: "vercel-blob" | "local-mirror";
};

export type ListBlobsResult = {
  blobs: StoredBlob[];
  cursor?: string;
  hasMore: boolean;
};
