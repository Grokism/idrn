import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DisasterData, DisasterDataService } from '../disaster-data.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-disaster-data-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './disaster-data-list.html',
  styleUrls: ['./disaster-data-list.scss']
})
export class DisasterDataListComponent implements OnInit {
  disasterData: DisasterData[] = [];
  filteredData: DisasterData[] = [];
  searchTerm: string = '';
  fields: (keyof DisasterData)[] = [
    'name',
    'main contact method (link)',
    'work description per event',
    'type',
    'person to contact',
    'support method',
    'size of group',
    'reference',
    'service sectors',
    'IDRN',
    'Correspondents direct conx'
  ];
  selectedField: keyof DisasterData = this.fields[0];

  constructor(private disasterDataService: DisasterDataService) { }

  ngOnInit(): void {
  }

  search(): void {
    if (this.searchTerm) {
      this.filteredData = this.disasterData.filter(item =>
        item[this.selectedField].toString().toLowerCase().includes(this.searchTerm.toLowerCase())
      );
    } else {
      this.filteredData = this.disasterData;
    }
  }

  listAll(): void {
    this.disasterDataService.getDisasterData().subscribe(data => {
      this.disasterData = data;
      this.filteredData = data;
      this.searchTerm = '';
    });
  }
}
