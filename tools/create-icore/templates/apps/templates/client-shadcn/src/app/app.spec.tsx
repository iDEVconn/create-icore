import { render } from '@testing-library/react';
import App from './app';

describe('App', () => {
  it('should render without crashing', () => {
    const { baseElement } = render(<App />);
    expect(baseElement).toBeTruthy();
  });
});
