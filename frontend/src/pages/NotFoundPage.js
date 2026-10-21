import { Link } from 'react-router-dom';
import { EmptyState } from '../components/DataState';

export default function NotFoundPage() {
  return (
    <EmptyState
      title="Not on any shelf"
      message="This page doesn’t exist, or it was moved."
      action={<Link to="/" className="btn btn-primary">Back to the start</Link>}
    />
  );
}
