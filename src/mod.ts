import './modContent';

declare const MOD_METADATA: {
  name: string;
  version: string;
  author: string;
  description: string;
};

export default {
  getMetadata: () => ({
    name: MOD_METADATA.name,
    version: MOD_METADATA.version,
    author: MOD_METADATA.author,
    description: MOD_METADATA.description,
  }),
};
