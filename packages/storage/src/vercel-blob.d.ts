declare module "@vercel/blob" {
  export type PutBlobResult = {
    pathname: string;
    url: string;
    downloadUrl?: string;
    size: number;
    uploadedAt: Date;
    contentType?: string;
  };

  export type ListBlobResult = {
    blobs: PutBlobResult[];
    cursor?: string;
    hasMore: boolean;
  };

  export type GetBlobResult = {
    statusCode: number;
    arrayBuffer(): Promise<ArrayBuffer>;
  };

  export function put(
    pathname: string,
    body: Buffer | string | Blob | ArrayBuffer | ReadableStream,
    options: {
      access: "public" | "private";
      token: string;
      contentType?: string;
      addRandomSuffix?: boolean;
      allowOverwrite?: boolean;
    },
  ): Promise<PutBlobResult>;

  export function list(options: {
    prefix?: string;
    limit?: number;
    cursor?: string;
    token: string;
  }): Promise<ListBlobResult>;

  export function get(
    pathnameOrUrl: string,
    options: { token: string; access?: "public" | "private" },
  ): Promise<GetBlobResult | null>;

  export function del(url: string, options: { token: string }): Promise<void>;
}
