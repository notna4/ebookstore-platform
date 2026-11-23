import { Button, Tile } from '@carbon/react';
import { Add, Checkmark } from '@carbon/icons-react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookSection } from '../components/BookSection';
import { PageBreadcrumb } from '../components/PageBreadcrumb';
import { authors } from '../data/authors';
import { books } from '../data/books';
import { useStore } from '../store/StoreContext';

export function WritersPage() {
  const { state, dispatch } = useStore();
  const [params] = useSearchParams();
  const selected = authors.find((a) => a.id === params.get('author'));

  const followToggle = (id: string) => {
    const following = state.followedAuthors.includes(id);
    return (
      <Button
        size="sm"
        kind={following ? 'secondary' : 'tertiary'}
        renderIcon={following ? Checkmark : Add}
        onClick={() => dispatch({ type: 'author/toggleFollow', authorId: id })}
      >
        {following ? 'Following' : 'Follow'}
      </Button>
    );
  };

  return (
    <div className="page">
      <PageBreadcrumb items={[{ label: 'Home', to: '/' }, { label: 'My Writers' }]} />
      <h1>My Writers</h1>

      {selected && (
        <section className="writer-detail">
          <Tile>
            <h2>{selected.name}</h2>
            <p>{selected.bio}</p>
            {followToggle(selected.id)}
          </Tile>
          <BookSection
            title={`Books by ${selected.name}`}
            books={books.filter((b) => b.authorId === selected.id)}
          />
        </section>
      )}

      <h2>{state.followedAuthors.length > 0 ? 'All writers' : 'Discover writers'}</h2>
      <ul className="writer-grid">
        {[...authors]
          .sort((a, b) => Number(state.followedAuthors.includes(b.id)) - Number(state.followedAuthors.includes(a.id)))
          .map((a) => (
            <li key={a.id}>
              <Tile className="writer-card">
                <h3><Link to={`/writers?author=${a.id}`}>{a.name}</Link></h3>
                <p className="muted">{books.filter((b) => b.authorId === a.id).length} books</p>
                {followToggle(a.id)}
              </Tile>
            </li>
          ))}
      </ul>
    </div>
  );
}
