/** Client order shared between browser and worker InnerTube resolvers. */
export const INNERTUBE_CLIENT_CHAIN = [
  "IOS",
  "ANDROID_VR",
  "ANDROID",
  "TV_EMBEDDED",
  "WEB_EMBEDDED",
  "MWEB",
  "WEB",
  "MUSIC",
  "TV",
] as const

export type InnertubeClientName = (typeof INNERTUBE_CLIENT_CHAIN)[number]
