import type { Author } from '../types';

export const authors: Author[] = [
  { id: 'andrei-popescu', name: 'Andrei Popescu', bio: 'Andrei Popescu is a productivity coach who has spent fifteen years helping teams and students work with intention. His writing turns research on attention into simple daily habits.' },
  { id: 'radu-ionescu', name: 'Radu Ionescu', bio: 'Radu Ionescu is an educator and learning-science writer. He explores how curiosity, practice and feedback turn beginners into experts.' },
  { id: 'james-wright', name: 'James Wright', bio: 'James Wright is a former executive turned mentor. His books distil lessons from decades of leading start-ups through growth and failure.' },
  { id: 'james-adams', name: 'James Adams', bio: 'James Adams writes dark, fast-paced thrillers set in quiet towns where nothing is quite what it seems.' },
  { id: 'jessica-martin', name: 'Jessica Martin', bio: 'Jessica Martin is a bestselling romance novelist known for sweeping, emotional stories about second chances.' },
  { id: 'laura-mitchell', name: 'Laura Mitchell', bio: 'Laura Mitchell is a former aerospace engineer who writes science fiction grounded in real physics and very human stakes.' },
  { id: 'daniel-reed', name: 'Daniel Reed', bio: 'Daniel Reed is a minimalism advocate and writer. After leaving a corporate career he began writing about living with less, and found far more peace, clarity and joy in doing so.' },
  { id: 'clara-nelson', name: 'Clara Nelson', bio: 'Clara Nelson writes gothic mysteries and ghost stories inspired by the old houses of her childhood.' },
  { id: 'emily-parker', name: 'Emily Parker', bio: 'Emily Parker is an award-winning children\'s author and illustrator whose gentle stories are loved by readers of all ages.' },
  { id: 'mara-stoica', name: 'Mara Stoica', bio: 'Mara Stoica is a poet, travel writer and cook. Her work celebrates food, memory and the journeys in between.' },
  { id: 'omar-haddad', name: 'Omar Haddad', bio: 'Omar Haddad is a historian and biographer who brings forgotten figures and distant eras vividly to life.' },
  { id: 'sofia-rossi', name: 'Sofia Rossi', bio: 'Sofia Rossi writes young-adult fiction, comics and stage plays about growing up and finding your voice.' },
  { id: 'henry-cole', name: 'Henry Cole', bio: 'Henry Cole is a science communicator and philosopher who makes big ideas feel approachable.' },
  { id: 'ioana-marin', name: 'Ioana Marin', bio: 'Ioana Marin is a linguist and teacher who designs story-based methods for learning new languages quickly.' },
];

export const authorById = (id: string): Author | undefined =>
  authors.find((a) => a.id === id);
