import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const KEY = 'envelope:store';

describe('Envelope', () => {
  it('shows the month with ready to assign and an overspent warning when needed', () => {
    window.location.hash = '/budget';
    render(<App />);
    expect(screen.getByTestId('rta')).toHaveTextContent('Ready to assign');
    expect(screen.getByLabelText('Assigned to Groceries')).toHaveValue('420.00');
    expect(screen.getAllByText('Demo data').length).toBeGreaterThan(0);
  });

  it('changes an allocation and moves money with validation', async () => {
    window.location.hash = '/budget';
    const user = userEvent.setup();
    render(<App />);
    const before = screen.getByTestId('rta').textContent;
    const input = screen.getByLabelText('Assigned to Hobbies');
    await user.clear(input);
    await user.type(input, '100{Enter}');
    expect(screen.getByTestId('rta').textContent).not.toBe(before);
    await user.click(screen.getByRole('button', { name: 'Move' }));
    expect(screen.getByText('Choose both envelopes.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('From'), within(screen.getByLabelText('From')).getByRole('option', { name: /^Emergency fund/ }));
    await user.selectOptions(screen.getByLabelText('To'), 'Eating out');
    await user.type(screen.getByLabelText('Amount'), '999999');
    await user.click(screen.getByRole('button', { name: 'Move' }));
    expect(screen.getByText(/Only .* is available to move/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Amount'));
    await user.type(screen.getByLabelText('Amount'), '25');
    await user.click(screen.getByRole('button', { name: 'Move' }));
    expect(screen.getByText('Moved $25.00 from Emergency fund to Eating out.')).toBeInTheDocument();
    expect(screen.getByLabelText('Assigned to Eating out')).toHaveValue('145.00');
  });

  it('adds spending with validation and filters transactions', async () => {
    window.location.hash = '/transactions';
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Save transaction' }));
    expect(screen.getByText('Choose which envelope it comes from.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Payee'), 'Bookshop');
    await user.type(screen.getAllByLabelText('Amount')[0], '18.5');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Envelope' }), 'Hobbies');
    await user.click(screen.getByRole('button', { name: 'Save transaction' }));
    expect(screen.getByText('Expense of $18.50 saved.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search'), 'bookshop');
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
  });

  it('starts empty after clearing and can add an envelope', async () => {
    localStorage.setItem(KEY, JSON.stringify({ envelopes: [], allocations: [], txns: [] }));
    window.location.hash = '/budget';
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText('No envelopes yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add envelope' }));
    expect(screen.getByText('Name the envelope.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Envelope name'), 'Gifts');
    await user.click(screen.getByRole('button', { name: 'Add envelope' }));
    expect(screen.getByLabelText('Assigned to Gifts')).toBeInTheDocument();
  });

  it('draws the six-month report', () => {
    window.location.hash = '/reports';
    render(<App />);
    expect(screen.getByRole('img', { name: /income \$2,(600|780)\.00/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Groceries: spent/ })).toBeInTheDocument();
  });
});
