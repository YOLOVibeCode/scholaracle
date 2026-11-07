/**
 * @jest-environment jsdom
 */
import { extractAeriesDashboardCourses } from '../extractors/aeries/aeries-extractors';
import { AERIES_SELECTORS_V1 } from './aeriesV1';
import { mergeSelectorRecord } from './mergeSelectorTables';

describe('selector table patch', () => {
  it('changes extraction when dashboard_class_cards is overridden', () => {
    document.body.innerHTML =
      '<div id="divClass"><div class="Card"><a class="TextHeading" href="/gb">Math</a></div></div>';

    expect(extractAeriesDashboardCourses(AERIES_SELECTORS_V1)).toHaveLength(1);

    const patched = mergeSelectorRecord(AERIES_SELECTORS_V1, {
      dashboard_class_cards: '#noSuch .Card',
    });
    expect(extractAeriesDashboardCourses(patched)).toHaveLength(0);
  });
});
