import { screen } from '@testing-library/react';
import { renderWithProviders } from './renderWithProviders';
import { useOrg } from '../context/useOrg';

function Probe() {
  const { data } = useOrg();
  return <div>員工數：{data.employees.length}</div>;
}

describe('renderWithProviders', () => {
  it('掛載 Org/Bpmn Provider 與 Router，可讀到 seed 資料', () => {
    renderWithProviders(<Probe />);
    expect(screen.getByText(/員工數：/)).toBeInTheDocument();
    expect(screen.getByText(/員工數：(?!0)/)).toBeTruthy();
  });
});
