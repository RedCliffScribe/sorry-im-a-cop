import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useChineseSearchNormalizer } from './useChineseSearchNormalizer';

function SearchFixture({ query, candidate }: { query: string; candidate: string }) {
  const normalize = useChineseSearchNormalizer(Boolean(query.trim()));
  return <output>{String(normalize(candidate).includes(normalize(query)))}</output>;
}

describe('useChineseSearchNormalizer', () => {
  it('loads Traditional-to-Simplified conversion for active search and matches both scripts', async () => {
    render(<SearchFixture query="設置與機構" candidate="设置与机构" />);

    await waitFor(() => expect(screen.getByText('true')).toBeInTheDocument());
  });
});
