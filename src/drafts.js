// RAM only. Never store patient drafts in site storage or the filesystem.
export class DraftStore {
  entries=new Map();
  mount(key,values){
    const previous=this.entries.get(key),changes=new Map();
    if(previous)for(const value of previous.values)if(JSON.stringify(value.value)!==JSON.stringify(previous.baseline.find(item=>item.key===value.key)?.value))changes.set(value.key,value.value);
    const baseline=structuredClone(values),restored=baseline.map(value=>changes.has(value.key)?{...value,value:changes.get(value.key)}:{...value});
    this.entries.set(key,{baseline,values:restored});return restored;
  }
  update(key,values){const entry=this.entries.get(key);if(entry)entry.values=structuredClone(values);}
  dirtyKeys(){return [...this.entries].filter(([,entry])=>JSON.stringify(entry.values)!==JSON.stringify(entry.baseline)).map(([key])=>key);}
  clear(keys=[...this.entries.keys()]){for(const key of keys)this.entries.delete(key);}
}
