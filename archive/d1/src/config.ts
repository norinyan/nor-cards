export const BACKGROUNDS = ['theme','white','yellow','green','blue'] as const;
export type Background = typeof BACKGROUNDS[number];
export interface PanelConfig {todo:string; completed:string; background:Background}
export function parseConfig(source:string):PanelConfig {
  const config:PanelConfig = {todo:'待办',completed:'已完成',background:'theme'};
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*(todo|completed|background)\s*:\s*(.*?)\s*$/.exec(line);
    if (!match || !match[2]) continue;
    const key = match[1], value = match[2];
    if (key === 'background') {
      if ((BACKGROUNDS as readonly string[]).includes(value)) config.background = value as Background;
    } else if (key === 'todo' || key === 'completed') config[key] = value;
  }
  return config;
}
