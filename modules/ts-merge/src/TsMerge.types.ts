export type TsMergeModuleEvents = {
  onProgress: (params: MergeProgress) => void;
};

export type MergeProgress = {
  progress: number;
};

export type MergeResult = {
  uri: string;
  sizeBytes: number;
};
