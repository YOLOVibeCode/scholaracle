/** Worker shutdown paths call process.exit; never terminate the Jest runner. */
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

beforeEach(() => {
  if (!jest.isMockFunction(process.exit)) {
    jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  } else {
    mockProcessExit.mockImplementation((() => undefined) as never);
  }
});
