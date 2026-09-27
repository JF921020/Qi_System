from .models import ICSetting


def database_catalog():
    catalog = {"rx": {}, "charger": {}, "rxFixed": {}, "chargerFixed": {}, "rxPending": [], "chargerPending": []}
    settings = list(ICSetting.objects.all())
    for item in settings:
        if item.provisional:
            catalog[item.kind + "Pending"].append(item.code)
        if item.mode == "fixed":
            catalog[item.kind + "Fixed"][item.code] = item.efficiency
        else:
            catalog[item.kind][item.code] = {"axis": item.axis, "data": item.points, "src": item.source}
    return catalog, settings
