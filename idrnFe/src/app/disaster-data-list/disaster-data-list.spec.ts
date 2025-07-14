import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DisasterDataList } from './disaster-data-list';

describe('DisasterDataList', () => {
  let component: DisasterDataList;
  let fixture: ComponentFixture<DisasterDataList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DisasterDataList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DisasterDataList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
