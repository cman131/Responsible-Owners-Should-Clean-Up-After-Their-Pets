// Moves that Metronome cannot call
export const METRONOME_EXCLUDED = new Set([
  'afteryou', 'assist', 'beakblast', 'belch', 'bestow', 'bounce', 'celebrate',
  'chatter', 'comeuppance', 'copycat', 'counter', 'covet', 'destinybond', 'detect',
  'dig', 'dive', 'dynamicpunch', 'endure', 'feint', 'fly', 'focuspunch',
  'followme', 'freezeshock', 'gigatonhammer', 'gravapple', 'holdback', 'holdhands',
  'iceburn', 'instruct', 'kingshield', 'lightthatburnsthesky', 'lovelysugar',
  'mefirst', 'metronome', 'mimic', 'mindblown', 'mirrorcoat', 'mirrormove',
  'naturepower', 'phantomforce', 'photongeyser', 'precipiceblades', 'protect',
  'quash', 'ragefist', 'ragepowder', 'relicsong', 'shadowforce', 'shellsmash',
  'shellsidearm', 'sketch', 'skydrop', 'sleeptalk', 'snatch', 'spikyshield',
  'spotlight', 'struggle', 'switcheroo', 'thief', 'thousandarrows', 'thousandwaves',
  'trick', 'trickroom', 'whirlwind',
]);

// Moves that Copycat cannot call
export const COPYCAT_EXCLUDED = new Set([
  'assist', 'bestow', 'chatter', 'circlethrow', 'comeuppance', 'copycat',
  'counter', 'covet', 'destinybond', 'detect', 'dragonrage', 'endure',
  'feint', 'focuspunch', 'followme', 'helpinghand', 'mefirst', 'metronome',
  'mimic', 'mirrorcoat', 'mirrormove', 'naturepower', 'protect', 'quash',
  'ragepowder', 'roar', 'shadowforce', 'sketch', 'sleeptalk', 'snatch',
  'spikyshield', 'struggle', 'switcheroo', 'thief', 'transform', 'trick',
  'whirlwind',
]);

// Moves that Sleep Talk cannot call
export const SLEEP_TALK_EXCLUDED = new Set([
  'assist', 'bide', 'bounce', 'copycat', 'dig', 'dive', 'fly',
  'freezeshock', 'iceburn', 'metronome', 'mimic', 'mirrormove',
  'phantomforce', 'shadowforce', 'sketch', 'skydrop', 'sleeptalk', 'snatch',
  'uproar',
]);
