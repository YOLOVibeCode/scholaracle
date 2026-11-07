/** Jest worker runs exercise shutdown; never terminate the test runner. */
jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
