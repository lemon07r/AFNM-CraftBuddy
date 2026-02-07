import './modContent';

declare const MOD_METADATA: {
  name: string;
  version: string;
  author: { name: string };
  description: string;
};

export default {
  getMetadata: () => MOD_METADATA,
};
