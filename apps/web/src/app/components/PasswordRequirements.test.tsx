/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { PasswordRequirements } from './PasswordRequirements';

const items = () => screen.getAllByRole('listitem');

describe('PasswordRequirements', () => {
  it('shows nothing until they start typing', () => {
    render(<PasswordRequirements password="" id="password-requirements" />);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('At least 8 characters')).not.toBeInTheDocument();
  });

  it('appears as soon as the first character is typed, with every unmet rule marked', () => {
    render(<PasswordRequirements password="1" />);

    expect(items()).toHaveLength(5);
    // "1" satisfies only the number rule.
    expect(screen.getAllByText('Met:')).toHaveLength(1);
    expect(screen.getAllByText('Not met:')).toHaveLength(4);
  });

  it('names the 8-character minimum the server enforces', () => {
    render(<PasswordRequirements password="a" />);

    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
  });

  it('ticks only the rules the typed password satisfies', () => {
    render(<PasswordRequirements password="abc" />);

    // Only the lowercase rule is satisfied by "abc".
    expect(screen.getAllByText('Met:')).toHaveLength(1);
    expect(items()[1]).toHaveTextContent('Met: One lowercase letter (a-z)');
    expect(items()[0]).toHaveTextContent('Not met: At least 8 characters');
  });

  it('shows every rule met for a password that satisfies them all', () => {
    render(<PasswordRequirements password="Abcdef1!" />);

    expect(screen.getAllByText('Met:')).toHaveLength(5);
    expect(screen.queryByText('Not met:')).not.toBeInTheDocument();
  });

  it('carries the id the input points at with aria-describedby', () => {
    render(<PasswordRequirements password="a" id="password-requirements" />);

    expect(screen.getByRole('list')).toHaveAttribute('id', 'password-requirements');
  });
});
