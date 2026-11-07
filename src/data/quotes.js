// Motivational quotes for surgeons-in-training. Where the original author is uncertain,
// the line is credited as a traditional surgical saying rather than to a named person.
export const QUOTES = [
  { text: 'The best preparation for tomorrow is to do today’s work superbly well.', by: 'Sir William Osler' },
  { text: 'A surgeon should have the eye of an eagle, the heart of a lion, and the hand of a lady.', by: 'Traditional, after John Halle (1565)' },
  { text: 'Good surgeons know how to operate, better surgeons know when to operate, and the best surgeons know when not to operate.', by: 'Surgical maxim' },
  { text: 'Surgery has been made safe for the patient; we must now make the patient safe for surgery.', by: 'Lord Berkeley Moynihan' },
  { text: 'I dressed him, and God healed him.', by: 'Ambroise Paré' },
  { text: 'Better is possible. It does not take genius. It takes diligence. It takes moral clarity. It takes ingenuity. And above all, it takes a willingness to try.', by: 'Atul Gawande, Better' },
  { text: 'You can’t ever reach perfection, but you can believe in an asymptote toward which you are ceaselessly striving.', by: 'Paul Kalanithi, When Breath Becomes Air' },
  { text: 'The best interest of the patient is the only interest to be considered.', by: 'Dr William J. Mayo' },
  { text: 'To study the phenomena of disease without books is to sail an uncharted sea, while to study books without patients is not to go to sea at all.', by: 'Sir William Osler' },
  { text: 'Live neither in the past nor in the future, but let each day’s work absorb your entire energies.', by: 'Sir William Osler' },
  { text: 'Observe, record, tabulate, communicate. Use your five senses.', by: 'Sir William Osler' },
  { text: 'Life is short, the art long, opportunity fleeting, experiment treacherous, judgement difficult.', by: 'Hippocrates, Aphorisms' },
  { text: 'He who wishes to be a surgeon should go to war.', by: 'Attributed to Hippocrates' },
  { text: 'Why think? Why not try the experiment?', by: 'John Hunter, to Edward Jenner' },
  { text: 'Ubi pus, ibi evacua — where there is pus, let it out.', by: 'Latin surgical maxim' },
  { text: 'Better a diagnosis without a surgeon than a surgeon without a diagnosis.', by: 'Surgical aphorism' },
  { text: 'Eat when you can, sleep when you can, and don’t mess with the pancreas.', by: 'Old surgical saying' },
  { text: 'Dissect in the right plane, and the operation will do itself.', by: 'Surgical aphorism' },
  { text: 'The operation is ninety percent decided before the first incision.', by: 'Surgical aphorism' },
  { text: 'Measure twice, cut once.', by: 'Craftsman’s proverb, every surgeon’s rule' },
  { text: 'Never let the skin stand between you and the diagnosis.', by: 'Surgical aphorism' },
  { text: 'The abdomen is a temple of surprises.', by: 'Surgical saying' },
  { text: 'Repetitio est mater studiorum — repetition is the mother of learning.', by: 'Latin proverb' },
  { text: 'Success is the sum of small efforts, repeated day in and day out.', by: 'Robert Collier' },
  { text: 'Practice is the best of all instructors.', by: 'Publilius Syrus' },
  { text: 'The more I practice, the luckier I get.', by: 'Gary Player' },
  { text: 'Knowledge is of no value unless you put it into practice.', by: 'Attributed to Anton Chekhov, physician & writer' },
  { text: 'It always seems impossible until it’s done.', by: 'Attributed to Nelson Mandela' },
  { text: 'Discipline is the bridge between goals and accomplishment.', by: 'Jim Rohn' },
  { text: 'The expert in anything was once a beginner.', by: 'Helen Hayes' },
  { text: 'A steady hand is built from ten thousand quiet hours of preparation.', by: 'Surgical residency wisdom' },
  { text: 'The scalpel follows the mind. Sharpen the mind first.', by: 'Surgical residency wisdom' },
  { text: 'Every MCh seat was won one topic, one recall, one morning at a time.', by: 'Scalpel' },
  { text: 'Respect the tissue, respect the patient, respect the process.', by: 'Surgical maxim' },
  { text: 'Hemostasis is a state of mind: calm, methodical, complete. So is revision.', by: 'Scalpel' },
  { text: 'The good physician treats the disease; the great physician treats the patient who has the disease.', by: 'Attributed to Sir William Osler' },
];

export function quoteOfTheDay(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - start) / 86400000);
  return dayOfYear % QUOTES.length;
}
