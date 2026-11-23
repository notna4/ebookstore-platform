import type { Book, BookFormat } from '../types';

const publishers = ['ABC Publishers', 'Lantern House', 'Northwind Books', 'Carpați Press', 'Orbit & Co.'];

type Row = [
  title: string,
  subtitle: string,
  authorId: string,
  categoryId: string,
  tags: string[],
  format: BookFormat,
  price: number,
  rating: number,
  sells: number,
  publishedAt: string,
  language?: string,
];

const rows: Row[] = [
  ['Beneath the Stars', 'Two strangers, one summer, and a promise made under an endless sky.', 'jessica-martin', 'romance', ['Fiction', 'Love', 'Drama'], 'Hardcover', 100, 4.6, 820, '2026-03-10'],
  ['Letters from Lisbon', 'A forgotten bundle of letters leads a translator to an unexpected love.', 'jessica-martin', 'romance', ['Fiction', 'Romance'], 'Paperback', 65, 4.3, 410, '2026-08-02'],
  ['The Midnight Hour', 'In a town that never sleeps, one hour each night belongs to something else.', 'james-adams', 'mystery', ['Fiction', 'Thriller', 'Horror'], 'Paperback', 60, 4.5, 1260, '2026-01-18'],
  ['The Vanishing House', 'Every morning the house on Alder Lane is a little harder to find.', 'clara-nelson', 'mystery', ['Fiction', 'Horror'], 'eBook', 20, 4.2, 530, '2026-10-05'],
  ['The Final Frontier', 'The last crew to leave Earth discovers they were never alone.', 'laura-mitchell', 'science-fiction', ['Fiction', 'Thriller'], 'Paperback', 70, 4.7, 1540, '2026-02-22'],
  ['Orbit of Glass', 'A station engineer uncovers a message hidden in a dying star.', 'laura-mitchell', 'science-fiction', ['Fiction', 'Space Opera'], 'eBook', 25, 4.1, 360, '2026-09-14'],
  ['The Ember Crown', 'A blacksmith\'s daughter inherits a crown that burns those who lie.', 'clara-nelson', 'fantasy', ['Fiction', 'Epic Fantasy'], 'Hardcover', 110, 4.8, 1710, '2026-04-09'],
  ['Whispers of the Hollow Oak', 'The forest remembers every promise, and every betrayal.', 'emily-parker', 'fantasy', ['Fiction', 'Fantasy'], 'Paperback', 55, 4.0, 295, '2026-07-21'],
  ['The Silk Road Ledger', 'A merchant\'s account book reveals the trade that shaped two continents.', 'omar-haddad', 'historical', ['Non-fiction', 'History'], 'Hardcover', 120, 4.4, 640, '2025-11-30'],
  ['Winter at Fort Ardent', 'A besieged garrison, a long winter and a secret no one can keep.', 'omar-haddad', 'historical', ['Fiction', 'Historical'], 'Paperback', 65, 4.2, 380, '2026-06-11'],
  ['The Quiet Architect', 'The life of the designer who built cities without ever raising her voice.', 'omar-haddad', 'biography', ['Non-fiction', 'Biography'], 'Hardcover', 130, 4.5, 470, '2026-05-03'],
  ['Ink and Iron', 'The printer who defied an empire with a single press.', 'henry-cole', 'biography', ['Non-fiction', 'Biography'], 'Paperback', 70, 4.3, 330, '2026-08-27'],
  ['The Art of Focus', 'Reclaim your attention in a world designed to steal it.', 'andrei-popescu', 'self-help', ['Non-fiction', 'Self Help'], 'Paperback', 80, 4.6, 1980, '2026-02-01'],
  ['The Art of Learning', 'Practical methods to learn anything faster and remember it longer.', 'radu-ionescu', 'self-help', ['Non-fiction', 'Self Help'], 'Paperback', 50, 4.4, 1120, '2026-03-15'],
  ['The Path to Success', 'Ten principles from people who built something that lasts.', 'james-wright', 'self-help', ['Non-fiction', 'Self Help'], 'Paperback', 70, 4.5, 1430, '2026-01-05'],
  ['Joy of Minimalism', 'Declutter your life to uncover peace, clarity, and joy.', 'daniel-reed', 'self-help', ['Non-fiction', 'Self Help'], 'Paperback', 30, 5, 145, '2026-10-20'],
  ['Mornings in Maramureș', 'A childhood in a Maramureș village told through haystacks, plum brandy and family stories.', 'mara-stoica', 'memoir', ['Non-fiction', 'Memoir'], 'Paperback', 60, 4.4, 450, '2026-04-25'],
  ['The House on Elm Street', 'A daughter returns home to sell the house and finds her family\'s story.', 'jessica-martin', 'memoir', ['Non-fiction', 'Memoir'], 'eBook', 25, 4.1, 260, '2026-09-01'],
  ['Footprints in Fog', 'Slow travel through the misty villages of the Carpathian Mountains.', 'mara-stoica', 'travel', ['Non-fiction', 'Travel'], 'Paperback', 75, 4.3, 390, '2026-03-30'],
  ['Seven Trains South', 'One rail pass, seven journeys and the people met along the way.', 'daniel-reed', 'travel', ['Non-fiction', 'Travel'], 'Paperback', 70, 4.2, 310, '2026-07-08'],
  ['The Herb Drawer', 'Everyday Romanian cooking, one herb at a time.', 'mara-stoica', 'cooking', ['Non-fiction', 'Cooking'], 'Hardcover', 140, 4.7, 1350, '2026-02-12'],
  ['One-Pot Wonders', 'Forty weeknight dinners with a single pan and almost no washing up.', 'ioana-marin', 'cooking', ['Non-fiction', 'Cooking'], 'Paperback', 50, 4.2, 720, '2026-06-19'],
  ['The Lost Kitten', 'A very small kitten, a very big city, and a long way home.', 'emily-parker', 'children', ['Fiction', 'Children'], 'Hardcover', 70, 4.8, 1580, '2026-10-12'],
  ['Pip and the Paper Moon', 'Pip folds a moon out of paper and takes it on an adventure.', 'emily-parker', 'children', ['Fiction', 'Children'], 'Paperback', 40, 4.5, 870, '2026-05-17'],
  ['Sixteen Summers', 'One last summer before everything changes.', 'sofia-rossi', 'young-adult', ['Fiction', 'Coming of Age'], 'Paperback', 55, 4.3, 940, '2026-06-02'],
  ['The Last Locker', 'The graffiti in locker 114 is a message meant just for her.', 'sofia-rossi', 'young-adult', ['Fiction', 'Mystery'], 'eBook', 20, 4.0, 410, '2026-09-23'],
  ['Neon Alley, Vol. 1', 'A courier, a stolen drive and one very long night in a neon city.', 'sofia-rossi', 'comics', ['Fiction', 'Graphic Novel'], 'Paperback', 90, 4.6, 780, '2026-04-14'],
  ['Paper Tigers', 'Four friends start a comic club and accidentally start a movement.', 'emily-parker', 'comics', ['Fiction', 'Graphic Novel'], 'Paperback', 80, 4.2, 350, '2026-08-08'],
  ['Salt and Plum Brandy', 'Poems about kitchens, migration and the taste of home.', 'mara-stoica', 'poetry', ['Poetry'], 'Paperback', 45, 4.4, 280, '2026-03-04'],
  ['Small Lights', 'Short poems for the long hours between midnight and morning.', 'daniel-reed', 'poetry', ['Poetry'], 'eBook', 20, 4.1, 190, '2026-10-30'],
  ['The Understudy', 'A play about the person waiting in the wings of someone else\'s life.', 'sofia-rossi', 'drama', ['Drama', 'Play'], 'Paperback', 60, 4.0, 150, '2026-05-28'],
  ['Act Three', 'Three acts, one family dinner and a secret that won\'t stay quiet.', 'jessica-martin', 'drama', ['Drama', 'Play'], 'Paperback', 60, 4.2, 210, '2026-09-09'],
  ['Cosmos in a Cup', 'The universe\'s biggest ideas, explained over a cup of tea.', 'henry-cole', 'science', ['Non-fiction', 'Science'], 'Hardcover', 110, 4.7, 1290, '2026-01-27'],
  ['The Hidden Life of Cells', 'A guided tour of the tiny machines that make you, you.', 'henry-cole', 'science', ['Non-fiction', 'Science'], 'Paperback', 85, 4.4, 610, '2026-07-16'],
  ['Meditations for Modern Minds', 'Ancient philosophy for a noisy, notification-filled world.', 'henry-cole', 'philosophy', ['Non-fiction', 'Philosophy'], 'Paperback', 65, 4.5, 730, '2026-02-26'],
  ['The Examined Day', 'One question for every day of the year.', 'radu-ionescu', 'philosophy', ['Non-fiction', 'Philosophy'], 'Hardcover', 80, 4.1, 240, '2026-08-19'],
  ['Paths of Light', 'A comparative journey through the world\'s great spiritual traditions.', 'omar-haddad', 'religion', ['Non-fiction', 'Religion'], 'Hardcover', 100, 4.3, 360, '2026-04-02'],
  ['The Pilgrim\'s Compass', 'Walking the old pilgrim routes of Asia and Europe.', 'mara-stoica', 'religion', ['Non-fiction', 'Religion'], 'Paperback', 70, 4.2, 270, '2026-07-30'],
  ['Learn German in 30 Days', 'A step-by-step daily plan for confident everyday German.', 'ioana-marin', 'language-learning', ['Non-fiction', 'Language'], 'Paperback', 45, 4.5, 1050, '2026-01-12', 'German'],
  ['French by Stories', 'Twenty short stories that teach French without a single grammar table.', 'ioana-marin', 'language-learning', ['Non-fiction', 'Language'], 'eBook', 30, 4.4, 520, '2026-06-24', 'French'],
];

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const books: Book[] = rows.map(
  ([title, subtitle, authorId, categoryId, tags, format, price, rating, sells, publishedAt, language], i) => ({
    id: slug(title),
    title,
    subtitle,
    authorId,
    publisher: publishers[i % publishers.length],
    categoryId,
    tags,
    format,
    price,
    language: language ?? 'English',
    rating,
    sells,
    publishedAt,
    isbn: `978-606-${String(4000 + i * 7).padStart(4, '0')}-${String(10 + i).padStart(2, '0')}-${i % 10}`,
  }),
);

export const bookById = (id: string): Book | undefined => books.find((b) => b.id === id);

export const languages: string[] = ['All', ...Array.from(new Set(books.map((b) => b.language)))];
